import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { logger, normalizeError } from '../../utils/logger'
import { StepKey } from '../../config/constants'
import { query } from '../../db/pg'

const AUTH_CACHE_MS = 60_000

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (!ctx.from) {
		logger.warn('No from field in context')
		return
	}

	const now = Date.now()
	const cachedAt = Number(ctx.session.temp?.authCheckedAt ?? 0)
	if (cachedAt && now - cachedAt < AUTH_CACHE_MS) {
		await next()
		return
	}

	const telegramIdDb = BigInt(ctx.from.id)

	try {
		const existingApp = await query<{ id: string; current_step: string | null }>(
			`SELECT id, current_step
       FROM applications
       WHERE telegram_id = $1
         AND status = 'IN_PROGRESS'
       ORDER BY created_at DESC
       LIMIT 1`,
			[telegramIdDb]
		)

		if (existingApp.rows[0]) {
			ctx.session.applicationId = existingApp.rows[0].id
			ctx.session.currentStep = (existingApp.rows[0].current_step as StepKey) || StepKey.PERSON_FULL_NAME

			logger.debug(
				{ telegramId: ctx.from.id, step: ctx.session.currentStep },
				'User resumed application'
			)
		}

		ctx.session.temp.authCheckedAt = now
		await next()
	} catch (err: unknown) {
		logger.error({ telegramId: ctx.from.id, ...normalizeError(err) }, 'Auth middleware error')
		await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
	}
}
