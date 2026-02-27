import { Middleware } from 'grammy'
import { Context } from '../bot'
import { applicationRepo } from '../../db/repositories/application.repo'
import { logger } from '../../utils/logger'
import { StepKey } from '../../config/constants'

export const authMiddleware: Middleware<Context> = async (ctx, next) => {
	if (!ctx.from) {
		logger.warn('No from field in context')
		return
	}

	try {
		// Check if user has existing application
		const existingApp = await applicationRepo.findByTelegramId(ctx.from.id)

		if (existingApp && existingApp.status === 'IN_PROGRESS') {
			ctx.session.applicationId = existingApp.id
			ctx.session.currentStep = (existingApp.currentStep as StepKey) || StepKey.PERSON_FULL_NAME

			logger.debug(
				{ telegramId: ctx.from.id, step: ctx.session.currentStep },
				'User resumed application'
			)
		}

		ctx.state = {
			...ctx.state,
			telegramId: ctx.from.id,
			application: existingApp
		}

		await next()
	} catch (error) {
		logger.error({ error, telegramId: ctx.from.id }, 'Auth middleware error')
		await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
	}
}
