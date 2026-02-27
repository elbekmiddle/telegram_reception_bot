import { Bot } from 'grammy'
import { Context } from './bot'
import { logger } from '../utils/logger'
import { applicationRepo } from '../db/repositories/answer.repo'
import { StepKey } from '../config/constants'

export function setupCommands(bot: Bot<Context>) {
	// Start command
	bot.command('start', async ctx => {
		try {
			const telegramId = ctx.from.id
			const existingApp = ctx.state.application

			if (existingApp) {
				const keyboard = {
					reply_markup: {
						inline_keyboard: [
							[
								{ text: '✅ Davom ettirish', callback_data: 'NAV|RESUME' },
								{ text: '🔄 Yangidan boshlash', callback_data: 'NAV|RESTART' }
							]
						]
					}
				}

				await ctx.reply(
					'Sizda boshlangan anketa mavjud. Davom ettirasizmi yoki yangidan boshlaysizmi?',
					keyboard
				)
			} else {
				await ctx.conversation.enter('applicationFlow')
			}
		} catch (error) {
			logger.error({ error, telegramId: ctx.from.id }, 'Start command error')
			await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
		}
	})

	// Cancel command
	bot.command('cancel', async ctx => {
		try {
			if (ctx.session.applicationId) {
				await applicationRepo.updateStatus(ctx.session.applicationId, 'CANCELLED')
			}

			ctx.session = {
				currentStep: StepKey.PERSON_FULL_NAME,
				history: [],
				temp: {},
				createdAt: Date.now(),
				lastActivity: Date.now()
			}

			await ctx.reply("Anketa bekor qilindi. Yangidan boshlash uchun /start buyrug'ini bosing.")
		} catch (error) {
			logger.error({ error, telegramId: ctx.from.id }, 'Cancel command error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Help command
	bot.command('help', async ctx => {
		const helpText = `
🆘 Yordam:

/start - Anketani boshlash
/cancel - Anketani bekor qilish
/help - Yordam olish

Agar muammo yuzaga kelsa, administrator bilan bog'laning.
    `
		await ctx.reply(helpText)
	})
}
