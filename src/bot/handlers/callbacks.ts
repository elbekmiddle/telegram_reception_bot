import { type Bot } from 'grammy'
import { type BotContext } from '../bot'
import { applicationService } from '../../services/application.service'
import { StepKey } from '../../config/constants'
import { logger } from '../../utils/logger'

export function setupCallbackHandlers(bot: Bot<BotContext>): void {
	bot.callbackQuery(/^NAV\|/, async (ctx, next) => {
		try {
			// Agar hozir conversation active bo'lsa, NAV|BACK/CANCEL/SKIP'ni flow o'zi boshqarsin
			const actives = await ctx.conversation.active().catch(() => [])
			if (actives.length) return next()

			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data

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
			return next()
		}
	})
}
