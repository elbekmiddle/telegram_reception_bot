import { InlineKeyboard } from 'grammy'
import type { BotContext } from './bot'
import { logger } from '../utils/logger'
import { userService } from '../services/user.service'

async function deletePrevBotMessage(ctx: BotContext) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (!msgId || !chatId) return
	try {
		await ctx.api.deleteMessage(chatId, msgId)
	} catch {
		// ignore
	}
}

async function replaceBotMessage(ctx: BotContext, text: string, kb?: InlineKeyboard) {
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, { reply_markup: kb })
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

async function exitAllConversations(ctx: BotContext): Promise<void> {
	try {
		const actives = await ctx.conversation.active()
		for (const name of actives) {
			try {
				await ctx.conversation.exit(name)
			} catch {
				// ignore
			}
		}
	} catch {
		// ignore
	}
}

export async function showStartMenu(ctx: BotContext): Promise<void> {
	try {
		await userService.upsertFromCtx(ctx)
		await exitAllConversations(ctx)

		const kb = new InlineKeyboard()
			.text('👔 Vakansiyalar', 'START|VAC')
			.row()
			.text('📚 Kurslar', 'START|COURSE')

		await replaceBotMessage(ctx, 'Assalomu alaykum! Nima qilamiz?', kb)
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'showStartMenu failed')
		await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.")
	}
}

export async function handleStartChoice(ctx: BotContext): Promise<void> {
	try {
		try {
			await ctx.answerCallbackQuery()
		} catch {
			// ignore
		}

		const data = ctx.callbackQuery?.data
		if (!data) return

		await exitAllConversations(ctx)

		if (data === 'START|VAC') {
			await ctx.conversation.enter('applicationFlow')
			return
		}
		if (data === 'START|COURSE') {
			await ctx.conversation.enter('courseFlow')
			return
		}
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'handleStartChoice failed')
		await replaceBotMessage(ctx, "Xatolik yuz berdi. /start bilan qayta urinib ko'ring.")
	}
}
