import { type Bot } from 'grammy'

import { type BotContext } from './bot'
import { logger } from '../utils/logger'
import { StepKey } from '../config/constants'
import { applicationService } from '../services/application.service'
import { keyboards } from '../utils/keyboards'

export function setupCommands(bot: Bot<BotContext>): void {
bot.command('start', async ctx => {
	try {
		const telegramId = ctx.from?.id
		if (!telegramId) return


		// agar resume/restart flow'ing bo'lsa
		if (ctx.state.applicationId && ctx.state.inProgress) {
			await ctx.reply(
				'Sizda boshlangan anketa bor. Davom ettirasizmi yoki yangidan boshlaysizmi?',
				{ reply_markup: keyboards.resumeOrRestart() }
			)
			return
		}

		const app = await applicationService.createApplication(telegramId)
		ctx.session.applicationId = app.id
		ctx.session.currentStep = StepKey.PERSON_FULL_NAME
		ctx.session.history = []
		ctx.session.temp = {}
		ctx.session.lastBotMessageId = undefined

		await ctx.conversation.enter('applicationFlow')
	} catch (err) {
		logger.error({ err }, 'Start command failed')
		await ctx.reply("Xatolik yuz berdi. /start bilan qayta urinib ko'ring.")
	}
})
	bot.command('cancel', async ctx => {
		try {
			if (ctx.session.applicationId) {
				await applicationService.cancelApplication(ctx.session.applicationId)
			}
			ctx.session.applicationId = undefined
			ctx.session.currentStep = StepKey.PERSON_FULL_NAME
			ctx.session.history = []
			ctx.session.temp = {}
			await ctx.reply("Anketa bekor qilindi. /start bilan yangidan boshlang.")
		} catch (err) {
			logger.error({ err, telegramId: ctx.from?.id }, 'Cancel command failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.command('help', async ctx => {
		await ctx.reply(
			[
				'🆘 Yordam:',
				'/start — anketa boshlash',
				'/cancel — anketani bekor qilish',
				'/help — yordam',
				'/admin — admin panel (faqat adminlar)'
			].join('\n')
		)
	})

	bot.command('admin', async ctx => {
		const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
		const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
		const id = ctx.from?.id
		if (!id || (id !== admin1 && id !== admin2)) {
			await ctx.reply('Ruxsat yo‘q.')
			return
		}
		await ctx.conversation.enter('adminFlow')
	})
}
