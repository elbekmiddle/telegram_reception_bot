import { type Bot } from 'grammy'
import { type BotContext } from './bot'
import { logger } from '../utils/logger'
import { showStartMenu } from './start.menu'

export function setupCommands(bot: Bot<BotContext>): void {
	// /start is handled as a simple menu (not a conversation)
	bot.command('start', showStartMenu)

	// Admin command
	bot.command('admin', async ctx => {
		try {
			const id = ctx.from?.id
			const a1 = Number(process.env.ADMIN_CHAT_ID || 0)
			const a2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
			const isAdmin = Boolean(id && (id === a1 || id === a2))
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
			ctx.session.temp = { answers: {} }

			await ctx.reply('❌ Jarayon bekor qilindi. /start bilan qaytadan boshlang.')
		} catch (err) {
			logger.error({ err, userId: ctx.from?.id }, 'Cancel command error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})
}
