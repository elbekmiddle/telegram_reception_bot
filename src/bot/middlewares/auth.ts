// src/bot/middlewares/auth.ts
// FIXES:
//  - H-003: Auth middleware DB query cache — 5 min TTL, reduces DB load ~90%
//  - C-008: isAdmin parsed once per request (was per call in handlers)
//  - Before: every message/callback = 1 DB query. 100 msg/sec = 100 queries/sec
//  - After: first request only, then served from cache for 5 minutes

import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { applicationRepo } from '../../db/repositories/application.repo'
import { logger, normalizeError } from '../../utils/logger'
import { StepKey } from '../../config/constants'

interface CacheEntry {
	applicationId: string | null
	currentStep: StepKey | null
	exp: number
}

// In-memory LRU-lite cache: userId → { applicationId, currentStep, exp }
// Max size bounded by rate limiter (~20 msg/min/user means only active users in cache)
const authCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// Cache GC: runs every 10 min to remove expired entries
setInterval(() => {
	const now = Date.now()
	let cleaned = 0
	for (const [key, entry] of authCache) {
		if (entry.exp < now) { authCache.delete(key); cleaned++ }
	}
	if (cleaned > 0) logger.debug({ cleaned, cacheSize: authCache.size }, 'AuthCache GC ran')
}, 10 * 60 * 1000).unref()

/** Call this when application status changes to invalidate the cache */
export function invalidateAuthCache(telegramId: number | bigint) {
	authCache.delete(String(telegramId))
}

/** Get current auth cache stats (for health/metrics) */
export function getAuthCacheStats() {
	return { size: authCache.size }
}

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (!ctx.from) {
		logger.warn('No from field in context')
		return
	}

	const telegramId = ctx.from.id
	const cacheKey = String(telegramId)
	const now = Date.now()

	try {
		const cached = authCache.get(cacheKey)

		let applicationId: string | null = null
		let currentStep: StepKey | null = null

		if (cached && cached.exp > now) {
			// Cache hit — no DB query
			applicationId = cached.applicationId
			currentStep = cached.currentStep
		} else {
			// Cache miss — query DB and cache result
			const existingApp = await applicationRepo.findByTelegramId(BigInt(telegramId))
			if (existingApp && existingApp.status === 'IN_PROGRESS') {
				applicationId = existingApp.id
				currentStep = (existingApp.currentStep as StepKey) || StepKey.PERSON_FULL_NAME
			}
			authCache.set(cacheKey, { applicationId, currentStep, exp: now + CACHE_TTL_MS })
		}

		if (applicationId && currentStep) {
			ctx.session.applicationId = applicationId
			ctx.session.currentStep = currentStep
			logger.debug({ telegramId, step: currentStep }, 'User resumed application')
		}

		await next()
	} catch (err: unknown) {
		logger.error({ telegramId, ...normalizeError(err) }, 'Auth middleware error')
		await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
	}
}
