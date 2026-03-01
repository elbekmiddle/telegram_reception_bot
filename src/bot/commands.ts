import { type Bot } from 'grammy'
import { type BotContext } from './bot'
import { logger } from '../utils/logger'

export function setupCommands(bot: Bot<BotContext>): void {
	// Start command - conversationni boshlaydi
	bot.command('start', async ctx => {
		try {
			logger.debug({ userId: ctx.from?.id }, 'Start command received')

			// Agar conversation active bo'lsa, to'xtatib yangisini boshlaymiz
			const activeConversations = await ctx.conversation.active()
			if (activeConversations.length > 0) {
				await ctx.conversation.exit()
			}

			// Application flow ni boshlaymiz
			await ctx.conversation.enter('applicationFlow')
		} catch (err) {
			logger.error({ err, userId: ctx.from?.id }, 'Start command error')
			await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.")
		}
	})

	// Admin command
	bot.command('admin', async ctx => {
		try {
			const isAdmin = ctx.from?.id.toString() === process.env.ADMIN_CHAT_ID
			if (!isAdmin) {
				await ctx.reply('Bu buyruq faqat adminlar uchun.')
				return
			}

			const activeConversations = await ctx.conversation.active()
			if (activeConversations.length > 0) {
				await ctx.conversation.exit()
			}

			await ctx.conversation.enter('adminFlow')
		} catch (err) {
			logger.error({ err, userId: ctx.from?.id }, 'Admin command error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Cancel command - conversationni to'xtatadi
	bot.command('cancel', async ctx => {
		try {
			await ctx.conversation.exit()

			if (ctx.session.applicationId) {
				// Bu yerda applicationni cancel qilish kerak
				// applicationService.cancelApplication(ctx.session.applicationId)
			}

			ctx.session.applicationId = undefined
			ctx.session.currentStep = undefined
			ctx.session.history = []
			ctx.session.temp = {}

			await ctx.reply('❌ Jarayon bekor qilindi. /start bilan qaytadan boshlang.')
		} catch (err) {
			logger.error({ err, userId: ctx.from?.id }, 'Cancel command error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})
}
