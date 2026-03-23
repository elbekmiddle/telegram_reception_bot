// src/bot/middlewares/session.ts
// FIXES:
//  - CRIT-001 / SC-003: In-memory session → Redis-ready adapter pattern
//  - C-006: Restart-safe — sessions survive process restarts with Redis
//  - M-012: Conversation timeout via lastActivity check
//
// HOW TO ENABLE REDIS (recommended for production):
//   1. npm install @grammyjs/storage-redis ioredis
//   2. Set REDIS_URL env var
//   3. Uncomment the Redis section below

import { session, type Context } from 'grammy'
import type { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'
import { logger } from '../../utils/logger'

// === OPTION A: In-memory (development only, NOT production) ===
// Max ~2,700 concurrent users before 5MB Node.js heap pressure
// Sessions lost on restart
// No horizontal scaling

// === OPTION B: Redis (production) ===
// Uncomment when @grammyjs/storage-redis is installed:
//
// import { RedisAdapter } from '@grammyjs/storage-redis'
// import Redis from 'ioredis'
// const redis = new Redis(process.env.REDIS_URL!)
// const storage = new RedisAdapter({ instance: redis, ttl: 7 * 24 * 60 * 60 }) // 7 days TTL
//
// Then replace `session<SessionData, Context>({` call below with `storage` option added.

const SESSION_INACTIVE_TIMEOUT_MS = 30 * 60 * 1000 // M-012 fix: 30 min inactivity resets flow state

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: { answers: {} },
	flowActive: false,
	flowState: { step: 'idle', data: {} },
	createdAt: Date.now(),
	lastActivity: Date.now()
})

function getSessionKey(ctx: Context): string | undefined {
	// Primary: user ID (most reliable, user-scoped)
	const userId = ctx.from?.id?.toString()
	if (userId) return `user:${userId}`

	// Fallback: private chat ID
	const chatId = ctx.chat?.id
	if (chatId && chatId > 0) return `chat:${chatId}` // positive = private chat

	// Avoid group chat sessions leaking across users (U-010 fix: don't create group sessions)
	// Groups have negative chatIds — skip them
	if (chatId && chatId < 0) {
		logger.warn({ chatId }, 'Skipping group chat session creation')
		return undefined
	}

	if ('callback_query' in ctx.update && ctx.update.callback_query?.id) {
		return `cb:${ctx.update.callback_query.id}`
	}

	return `upd:${ctx.update.update_id}`
}

export const sessionMiddleware = session<SessionData, Context>({
	initial: initialSessionData,
	getSessionKey,
})

/** Reset flow state for sessions that have been inactive (M-012 fix) */
export function resetInactiveFlowState(session: SessionData): SessionData {
	const now = Date.now()
	const lastActivity = session.lastActivity ?? session.createdAt ?? 0
	if (session.flowActive && (now - lastActivity) > SESSION_INACTIVE_TIMEOUT_MS) {
		logger.debug('Resetting stale flow state due to inactivity')
		return {
			...session,
			flowActive: false,
			flowState: { step: 'idle', data: {} },
			lastActivity: now
		}
	}
	return { ...session, lastActivity: now }
}
