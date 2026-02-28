import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { RateLimit } from '../../config/constants'
import { logger } from '../../utils/logger'

interface RateLimitStore {
	[key: string]: {
		count: number
		resetAt: number
	}
}

const store: RateLimitStore = {}

export const rateLimitMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (!ctx.from) return next()

	const key = `rate:${ctx.from.id}`
	const now = Date.now()

	// Clean old entries
	if (store[key] && store[key].resetAt < now) {
		delete store[key]
	}

	// Check rate limit
	if (store[key] && store[key].count >= RateLimit.MESSAGE_COUNT) {
		logger.warn({ telegramId: ctx.from.id }, 'Rate limit exceeded')
		await ctx.reply("Juda ko'p so'rov yubordingiz. Biroz kuting.")
		return
	}

	// Update counter
	if (!store[key]) {
		store[key] = {
			count: 1,
			resetAt: now + RateLimit.TIME_WINDOW
		}
	} else {
		store[key].count++
	}

	await next()
}
