import { Bot } from 'grammy'
import { Context } from '../bot'
import { adminService } from '../../services/admin.service'
import { logger } from '../../utils/logger'

export function setupAdminHandlers(bot: Bot<Context>) {
	// Approve callback
	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const [, , applicationId] = ctx.callbackQuery.data.split('|')
			await adminService.handleApprove(ctx, applicationId)
		} catch (error) {
			logger.error({ error }, 'Admin approve error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Reject callback
	bot.callbackQuery(/^AD\|REJECT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const [, , applicationId] = ctx.callbackQuery.data.split('|')
			await adminService.handleReject(ctx, applicationId)
		} catch (error) {
			logger.error({ error }, 'Admin reject error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Reject reason callback
	bot.callbackQuery(/^AD\|REJ_REASON\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const [, , , applicationId, reason] = ctx.callbackQuery.data.split('|')
			await adminService.handleRejectWithReason(ctx, applicationId, reason)
		} catch (error) {
			logger.error({ error }, 'Admin reject reason error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Contact callback
	bot.callbackQuery(/^AD\|CONTACT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const [, , , telegramId] = ctx.callbackQuery.data.split('|')

			const contactLink = `tg://user?id=${telegramId}`
			await ctx.reply(`👤 Foydalanuvchi bilan bog'lanish: ${contactLink}`)
		} catch (error) {
			logger.error({ error }, 'Admin contact error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})
}
