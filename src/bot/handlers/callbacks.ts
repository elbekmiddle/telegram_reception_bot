import { type Bot } from 'grammy'

import { type BotContext } from '../bot'
import { applicationService } from '../../services/application.service'
import { StepKey } from '../../config/constants'
import { logger } from '../../utils/logger'

export function setupCallbackHandlers(bot: Bot<BotContext>): void {
	bot.callbackQuery(/^NAV\|/, async (ctx, next) => {
		try {
			const data = ctx.callbackQuery.data
			if (!data) return next()

			// Only handle RESUME/RESTART here.
			// BACK/CANCEL/SKIP must go to conversation.wait().
			if (data === 'NAV|BACK' || data === 'NAV|CANCEL' || data === 'NAV|SKIP') {
				return next()
			}

			await ctx.answerCallbackQuery()

			if (data === 'NAV|RESUME') {
				await ctx.conversation.enter('applicationFlow')
				return
			}
			if (data === 'NAV|RESTART') {
				if (ctx.session.applicationId) {
					await applicationService.cancelApplication(ctx.session.applicationId)
				}
				ctx.session.applicationId = undefined
				ctx.session.currentStep = StepKey.PERSON_FULL_NAME
				ctx.session.history = []
				ctx.session.temp = {}

				await ctx.conversation.enter('applicationFlow')
				return
			}

			return next()
		} catch (err) {
			logger.error({ err, userId: ctx.from?.id }, 'NAV callback failed')
		}
	})
}
