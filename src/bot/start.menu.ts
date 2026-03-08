import { InlineKeyboard } from 'grammy'
import type { BotContext } from './bot'
import { logger } from '../utils/logger'
import { userService } from '../services/user.service'

function isAdminUser(userId?: number): boolean {
	const admins = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
		.map(v => Number(v || 0))
		.filter(Boolean)
	return Boolean(userId && admins.includes(userId))
}

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
		for (const name of Object.keys(actives)) {
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
			.text('📚 Kurslar', 'START|COURSE')
			.row()
			.text('👔 Vakansiyalar', 'START|VAC')

		if (isAdminUser(ctx.from?.id)) {
			kb.row().text('⚙️ Admin panel', 'START|ADMIN')
		}

		await replaceBotMessage(ctx, 'Kerakli bo‘limni tanlang.', kb)
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

		if (data === 'START|VAC' || data === 'user_vacancies') {
			await ctx.conversation.enter('applicationFlow')
			return
		}
		if (data === 'START|COURSE' || data === 'user_courses') {
			await ctx.conversation.enter('courseFlow')
			return
		}
		if (data === 'START|ADMIN') {
			if (!isAdminUser(ctx.from?.id)) {
				await replaceBotMessage(ctx, 'Bu bo‘lim faqat adminlar uchun.')
				return
			}
			await ctx.conversation.enter('adminFlow')
			return
		}
		if (data === 'user_back_main') {
			await showStartMenu(ctx)
		}
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'handleStartChoice failed')
		await replaceBotMessage(ctx, "Xatolik yuz berdi. /start bilan qayta urinib ko'ring.")
	}
}
