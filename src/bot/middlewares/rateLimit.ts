// src/bot/middlewares/rateLimit.ts
// FIXES:
//  - CRIT-002: Memory leak — periodic GC cleanup added
//  - H-008: callbackQuery bypass removed — spamming callbacks now rate-limited
//  - Separate limits for messages vs callbacks

import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { RateLimit } from '../../config/constants'
import { logger } from '../../utils/logger'

interface RateLimitEntry {
	count: number
	resetAt: number
}

const msgStore = new Map<string, RateLimitEntry>()
const cbStore = new Map<string, RateLimitEntry>()

// CRIT-002 FIX: Periodic GC — expired entries cleaned every 60s
// Before: store object grew forever, 52MB+ at 1M users, never cleaned
setInterval(() => {
	const now = Date.now()
	let cleaned = 0
	for (const [key, entry] of msgStore) {
		if (entry.resetAt < now) { msgStore.delete(key); cleaned++ }
	}
	for (const [key, entry] of cbStore) {
		if (entry.resetAt < now) { cbStore.delete(key); cleaned++ }
	}
	if (cleaned > 0) {
		logger.debug({ cleaned, msgStoreSize: msgStore.size, cbStoreSize: cbStore.size }, 'RateLimit GC ran')
	}
}, 60_000).unref()

function checkLimit(store: Map<string, RateLimitEntry>, key: string, maxCount: number, windowMs: number): boolean {
	const now = Date.now()
	const entry = store.get(key)
	if (!entry || entry.resetAt < now) {
		store.set(key, { count: 1, resetAt: now + windowMs })
		return false
	}
	if (entry.count >= maxCount) return true
	entry.count++
	return false
}

export const rateLimitMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (!ctx.from) return next()
	const userId = ctx.from.id

	// H-008 FIX: callbacks also rate-limited (60/min — generous but bounded)
	if (ctx.callbackQuery) {
		const limited = checkLimit(cbStore, `cb:${userId}`, 60, RateLimit.TIME_WINDOW)
		if (limited) {
			logger.warn({ telegramId: userId }, 'Callback rate limit exceeded')
			await ctx.answerCallbackQuery({ text: 'Juda tez bosyapsiz. Biroz kuting.', show_alert: false }).catch(() => {})
			return
		}
		return next()
	}

	const limited = checkLimit(msgStore, `msg:${userId}`, RateLimit.MESSAGE_COUNT, RateLimit.TIME_WINDOW)
	if (limited) {
		logger.warn({ telegramId: userId }, 'Message rate limit exceeded')
		await ctx.reply("Juda ko'p so'rov yubordingiz. Biroz kuting.")
		return
	}

	await next()
}

export function getRateLimitStats() {
	return { msgStoreSize: msgStore.size, cbStoreSize: cbStore.size }
}
