import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { userService } from '../../services/user.service'

async function replaceBotMessage(
	ctx: BotContext,
	text: string,
	options?: Parameters<BotContext['reply']>[1]
) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (msgId && chatId) {
		try {
			await ctx.api.deleteMessage(chatId, msgId)
		} catch {
			// ignore
		}
	}
	const sent = await ctx.reply(text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

export async function startFlow(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	// upsert user
	await userService.upsertFromCtx(ctx)

	const kb = new InlineKeyboard()
		.text('👔 Vakansiyalar', 'START|VAC')
		.row()
		.text('📚 Kurslar', 'START|COURSE')

	await replaceBotMessage(
		ctx,
		"Assalomu alaykum! Nima qilamiz?",
		{ reply_markup: kb }
	)

	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery?.data) continue
		await upd.answerCallbackQuery().catch(() => undefined)
		if (upd.callbackQuery.data === 'START|VAC') {
			// Context returned by conversation.wait() may not always include ConversationFlavor.
			// Use the conversation-enabled ctx captured by this handler.
			await ctx.conversation.exit()
			await ctx.conversation.enter('applicationFlow')
			return
		}
		if (upd.callbackQuery.data === 'START|COURSE') {
			await ctx.conversation.exit()
			await ctx.conversation.enter('courseFlow')
			return
		}
	}
}
