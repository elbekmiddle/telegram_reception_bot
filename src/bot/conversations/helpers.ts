import { InlineKeyboard } from 'grammy'
import type { Conversation } from '@grammyjs/conversations'
import type { BotContext } from '../bot'

export async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	keyboard?: InlineKeyboard
): Promise<string> {
	await ctx.reply(question, keyboard ? { reply_markup: keyboard } : undefined)

	const upd = await conversation.wait()
	const text = upd.message?.text?.trim()

	if (!text) {
		await ctx.reply('Iltimos, matn yuboring.')
		return askText(conversation, ctx, question, keyboard)
	}

	return text
}

export async function askContactOrText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	keyboard?: InlineKeyboard
): Promise<{ phone: string; fromContact: boolean }> {
	await ctx.reply(question, keyboard ? { reply_markup: keyboard } : undefined)

	const upd = await conversation.wait()

	const contactPhone = upd.message?.contact?.phone_number
	if (contactPhone) return { phone: contactPhone, fromContact: true }

	const text = upd.message?.text?.trim()
	if (text) return { phone: text, fromContact: false }

	await ctx.reply('Iltimos, telefon raqam yuboring (Contact yoki qo‘lda).')
	return askContactOrText(conversation, ctx, question, keyboard)
}
