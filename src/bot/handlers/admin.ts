import { type Bot } from 'grammy'

import { type BotContext } from '../bot'
import { adminService } from '../../services/admin.service'
import { logger } from '../../utils/logger'

export function setupAdminHandlers(bot: Bot<BotContext>): void {
	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const parts = ctx.callbackQuery.data.split('|')
			const applicationId = parts[2]
			await adminService.approve(ctx, applicationId)
		} catch (err) {
			logger.error({ err }, 'Admin approve failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.callbackQuery(/^AD\|REJECT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const parts = ctx.callbackQuery.data.split('|')
			const applicationId = parts[2]
			await adminService.askRejectReason(ctx, applicationId)
		} catch (err) {
			logger.error({ err }, 'Admin reject prompt failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.callbackQuery(/^AD\|REJ_R\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const parts = ctx.callbackQuery.data.split('|')
			const applicationId = parts[2]
			const reason = parts[3]
			await adminService.reject(ctx, applicationId, reason)
		} catch (err) {
			logger.error({ err }, 'Admin reject failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.callbackQuery(/^AD\|CONTACT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const parts = ctx.callbackQuery.data.split('|')
			const telegramId = parts[2]
			await ctx.reply(`tg://user?id=${telegramId}`)
		} catch (err) {
			logger.error({ err }, 'Admin contact failed')
		}
	})
}
