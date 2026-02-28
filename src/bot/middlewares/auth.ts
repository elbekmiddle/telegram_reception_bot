import { type Middleware } from 'grammy'
import { type BotContext } from '../bot'
import { applicationRepo } from '../../db/repositories/application.repo'
import { logger, normalizeError } from '../../utils/logger'
import { StepKey } from '../../config/constants'

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
	if (!ctx.from) {
		logger.warn('No from field in context')
		return
	}

	const telegramIdDb = BigInt(ctx.from.id)

	try {
		const existingApp = await applicationRepo.findByTelegramId(telegramIdDb)

		if (existingApp && existingApp.status === 'IN_PROGRESS') {
			ctx.session.applicationId = existingApp.id
			ctx.session.currentStep = (existingApp.currentStep as StepKey) || StepKey.PERSON_FULL_NAME

			logger.debug(
				{ telegramId: ctx.from.id, step: ctx.session.currentStep },
				'User resumed application'
			)
		}

		await next()
	} catch (err: unknown) {
		logger.error({ telegramId: ctx.from.id, ...normalizeError(err) }, 'Auth middleware error')
		await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
	}
}
