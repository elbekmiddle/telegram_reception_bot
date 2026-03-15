import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { env } from '../../config/env'
import { query } from '../../db/pg'

export const rateLimitMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (ctx.callbackQuery || !ctx.from) {
		return next()
	}

	const key = String(ctx.from.id)
	const result = await query<{ count: number }>(
		`INSERT INTO rate_limits (bucket, count, window_started_at, expires_at)
     VALUES ($1, 1, now(), now() + ($2::text || ' milliseconds')::interval)
     ON CONFLICT (bucket) DO UPDATE SET
       count = CASE
         WHEN rate_limits.expires_at < now() THEN 1
         ELSE rate_limits.count + 1
       END,
       window_started_at = CASE
         WHEN rate_limits.expires_at < now() THEN now()
         ELSE rate_limits.window_started_at
       END,
       expires_at = CASE
         WHEN rate_limits.expires_at < now() THEN now() + ($2::text || ' milliseconds')::interval
         ELSE rate_limits.expires_at
       END
     RETURNING count`,
		[key, env.RATE_LIMIT_WINDOW_MS]
	)

	const count = result.rows[0]?.count ?? 0
	if (count > env.RATE_LIMIT_MAX) {
		logger.warn({ telegramId: ctx.from.id, count }, 'Rate limit exceeded')
		await ctx.reply("Juda ko'p so'rov yubordingiz. Biroz kuting.")
		return
	}

	await next()
}
