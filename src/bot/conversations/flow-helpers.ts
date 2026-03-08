import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'
import type { BotContext } from '../bot'

export type NavSignal = 'BACK' | 'CANCEL' | 'SKIP' | 'START' | 'ADMIN'

type StartIntent = 'START' | 'ADMIN' | 'CANCEL'

/**
 * Joriy jarayonni to'xtatishni tasdiqlash
 */
async function confirmProcessInterrupt(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	intent: StartIntent,
	restore: () => Promise<void>
): Promise<StartIntent | null> {
	const titleMap: Record<StartIntent, string> = {
		START: '🏠 Bosh menyuga qaytmoqchimisiz?',
		ADMIN: '👨‍💼 Admin panelga o‘tmoqchimisiz?',
		CANCEL: '❌ Joriy jarayonni bekor qilmoqchimisiz?'
	}

	const kb = new InlineKeyboard()
		.text('✅ Ha', `INTERRUPT|${intent}|YES`)
		.text('↩️ Yo‘q', `INTERRUPT|${intent}|NO`)

	await replaceBotMessage(
		ctx,
		`${titleMap[intent]}

Joriy kiritishlar yo‘qoladi.`,
		{
			parse_mode: 'Markdown',
			reply_markup: kb
		}
	)

	while (true) {
		const upd = await conversation.wait()
		if (upd.callbackQuery?.data) {
			const data = upd.callbackQuery.data
			await upd.answerCallbackQuery().catch(() => {})
			if (data === `INTERRUPT|${intent}|YES`) return intent
			if (data === `INTERRUPT|${intent}|NO`) {
				await restore()
				return null
			}
			continue
		}

		const text = upd.message?.text?.trim()
		if (text === '/start') {
			intent = 'START'
			return await confirmProcessInterrupt(conversation, ctx, intent, restore)
		}
		if (text === '/admin') {
			intent = 'ADMIN'
			return await confirmProcessInterrupt(conversation, ctx, intent, restore)
		}
		if (text === '/cancel') {
			intent = 'CANCEL'
			return await confirmProcessInterrupt(conversation, ctx, intent, restore)
		}
	}
}

/**
 * Interrupt komandalarini handle qilish
 */
async function handleInterruptCommand(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	text: string,
	restore: () => Promise<void>
): Promise<boolean> {
	if (text !== '/start' && text !== '/admin' && text !== '/cancel') return false
	const intent = text === '/start' ? 'START' : text === '/admin' ? 'ADMIN' : 'CANCEL'
	const confirmed = await confirmProcessInterrupt(conversation, ctx, intent, restore)
	if (confirmed === 'START') throw navError('START')
	if (confirmed === 'ADMIN') throw navError('ADMIN')
	if (confirmed === 'CANCEL') throw navError('CANCEL')
	return true
}

/**
 * Navigatsiya xatoligi yaratish
 */
export const navError = (sig: NavSignal) => new Error(sig)

/**
 * Navigatsiya xatoligini tekshirish
 */
export function isNavSignal(err: unknown): err is Error {
	return err instanceof Error && ['BACK', 'CANCEL', 'SKIP', 'START', 'ADMIN'].includes(err.message)
}

/**
 * Oldingi bot xabarini o'chirish
 */
export async function deletePrevBotMessage(ctx: BotContext) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (!msgId || !chatId) return
	try {
		await ctx.api.deleteMessage(chatId, msgId)
	} catch {
		// ignore - xabar allaqachon o'chirilgan bo'lishi mumkin
	}
}

/**
 * Bot xabarini almashtirish (eskisini o'chirib, yangisini yuborish)
 */
export async function replaceBotMessage(
	ctx: BotContext,
	text: string,
	options?: Parameters<BotContext['reply']>[1]
) {
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

/**
 * Inline keyboard yaratish
 */
export function buildInlineKb(
	buttons: { text: string; data: string }[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
) {
	const kb = new InlineKeyboard()
	const cols = opts?.columns ?? 2

	// Asosiy tugmalar
	for (let i = 0; i < buttons.length; i++) {
		kb.text(buttons[i].text, buttons[i].data)
		if ((i + 1) % cols === 0 && i !== buttons.length - 1) {
			kb.row()
		}
	}

	if (buttons.length % cols !== 0 || buttons.length === 0) {
		kb.row()
	}

	// Navigatsiya tugmalari
	if (opts?.skip) {
		kb.text('⏭ O`tkazib yuborish', 'NAV|SKIP')
		kb.row()
	}
	if (opts?.back) {
		kb.text('⬅️ Orqaga', 'NAV|BACK')
		kb.row()
	}
	if (opts?.cancel) {
		kb.text('❌ Bekor qilish', 'NAV|CANCEL')
	}

	return kb
}

/**
 * Matn kiritishni so'rash
 */
export async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean }
): Promise<string> {
	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined

	const renderQuestion = async () =>
		await replaceBotMessage(
			ctx,
			question,
			navKb ? { parse_mode: 'Markdown', reply_markup: navKb } : { parse_mode: 'Markdown' }
		)

	await renderQuestion()

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			continue
		}

		const text = upd.message?.text?.trim()
		if (text) {
			const interrupted = await handleInterruptCommand(conversation, ctx, text, renderQuestion)
			if (interrupted) continue

			return text
		}

		await replaceBotMessage(ctx, 'Iltimos, matn yuboring ✍️')
	}
}

/**
 * Tanlov so'rash (Inline keyboard orqali)
 */
export async function askChoice(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: { text: string; data: string }[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
): Promise<string | null> {
	const allowedData = new Set(buttons.map(b => b.data))

	if (opts?.back) allowedData.add('NAV|BACK')
	if (opts?.cancel) allowedData.add('NAV|CANCEL')
	if (opts?.skip) allowedData.add('NAV|SKIP')

	const kb = buildInlineKb(buttons, opts)
	const renderQuestion = async () =>
		await replaceBotMessage(ctx, question, {
			parse_mode: 'Markdown',
			reply_markup: kb
		})

	await renderQuestion()

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|BACK') return null
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			if (!allowedData.has(data)) {
				continue
			}

			return data
		}

		const text = upd.message?.text?.trim()
		if (text) {
			const interrupted = await handleInterruptCommand(conversation, ctx, text, renderQuestion)
			if (interrupted) continue

			await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan birini tanlang 👇', {
				parse_mode: 'Markdown',
				reply_markup: kb
			})
		}
	}
}

/**
 * Telefon raqam so'rash (kontakt tugmasi bilan)
 */
export async function askPhone(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: { back?: boolean; cancel?: boolean }
): Promise<string> {
	const replyKeyboard = new Keyboard().requestContact('📱 Telefon raqamni yuborish').row()

	if (opts?.back) {
		replyKeyboard.text('⬅️ Orqaga').row()
	}
	if (opts?.cancel) {
		replyKeyboard.text('❌ Bekor qilish').row()
	}

	replyKeyboard.resized().oneTime()

	const renderQuestion = async () =>
		await replaceBotMessage(ctx, question, {
			parse_mode: 'Markdown',
			reply_markup: replyKeyboard
		})

	await renderQuestion()

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			continue
		}

		if (upd.message?.contact) {
			const phoneNumber = upd.message.contact.phone_number
			let clean = phoneNumber.replace(/\D/g, '')
			if (clean.startsWith('8')) clean = '7' + clean.slice(1)
			if (!clean.startsWith('+')) clean = '+' + clean
			return clean
		}

		const text = upd.message?.text?.trim()
		if (text) {
			const interrupted = await handleInterruptCommand(conversation, ctx, text, renderQuestion)
			if (interrupted) continue
			if (text === '⬅️ Orqaga') throw navError('BACK')
			if (text === '❌ Bekor qilish') throw navError('CANCEL')

			// Telefon raqam formatida tekshirish
			const clean = text.replace(/\D/g, '')
			if (clean.length >= 9) {
				let formatted = clean
				if (formatted.startsWith('8')) formatted = '7' + formatted.slice(1)
				if (!formatted.startsWith('+')) formatted = '+' + formatted
				return formatted
			}

			return text
		}

		await replaceBotMessage(ctx, 'Iltimos, telefon raqamingizni yozing yoki tugmani bosing 📱')
	}
}

/**
 * Inline tanlov so'rash (askChoice bilan bir xil, back qaytaradi)
 */
export async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: { text: string; data: string }[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
): Promise<string> {
	const result = await askChoice(conversation, ctx, question, buttons, opts)
	if (result === null) throw navError('BACK')
	return result
}

/**
 * Multi-select tanlov so'rash
 */
export async function askMultiSelect(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	options: { key: string; label: string }[],
	initial: Set<string>,
	nav?: { back?: boolean; cancel?: boolean }
): Promise<Set<string>> {
	const prefix = 'M'
	const selected = new Set<string>(initial)

	function buildMultiKb() {
		const kb = new InlineKeyboard()

		// 2 columns
		for (let i = 0; i < options.length; i++) {
			const o = options[i]
			const on = selected.has(o.key)
			kb.text(`${on ? '✅ ' : ''}${o.label}`, `${prefix}|T|${o.key}`)

			if (i % 2 === 1 || i === options.length - 1) {
				kb.row()
			}
		}

		kb.text('✅ Tayyor', `${prefix}|DONE`).row()

		if (nav?.back) {
			kb.text('⬅️ Orqaga', 'NAV|BACK').row()
		}
		if (nav?.cancel) {
			kb.text('❌ Bekor qilish', 'NAV|CANCEL')
		}

		return kb
	}

	const sent = await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: buildMultiKb()
	})

	while (true) {
		const upd = await conversation.wait()

		if (!upd.callbackQuery) {
			const txt = upd.message?.text?.trim()

			if (txt === '/start') throw navError('START')
			if (txt === '/admin') throw navError('ADMIN')
			if (txt === '/cancel') throw navError('CANCEL')

			if (txt) {
				await replaceBotMessage(ctx, question, {
					parse_mode: 'Markdown',
					reply_markup: buildMultiKb()
				})
				continue
			}

			await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan foydalaning 👇', {
				parse_mode: 'Markdown',
				reply_markup: buildMultiKb()
			})
			continue
		}

		const data = upd.callbackQuery.data
		if (!data) continue

		await upd.answerCallbackQuery().catch(() => {})

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === `${prefix}|DONE`) return selected

		const parts = data.split('|')
		if (parts.length === 3 && parts[0] === prefix && parts[1] === 'T') {
			const key = parts[2]
			if (selected.has(key)) {
				selected.delete(key)
			} else {
				selected.add(key)
			}

			try {
				await ctx.api.editMessageText(ctx.chat!.id, sent.message_id, question, {
					parse_mode: 'Markdown',
					reply_markup: buildMultiKb()
				})
				ctx.session.lastBotMessageId = sent.message_id
			} catch {
				const newSent = await replaceBotMessage(ctx, question, {
					parse_mode: 'Markdown',
					reply_markup: buildMultiKb()
				})
				ctx.session.lastBotMessageId = newSent.message_id
			}
		}
	}
}

/**
 * Rasm yuklashni so'rash
 */
export async function askPhoto(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string
): Promise<string> {
	const kb = new InlineKeyboard()
		.text('⬅️ Orqaga', 'NAV|BACK')
		.text('❌ Bekor qilish', 'NAV|CANCEL')

	await replaceBotMessage(ctx, question, { parse_mode: 'Markdown', reply_markup: kb })

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			await upd.answerCallbackQuery().catch(() => {})
			const data = upd.callbackQuery.data
			if (!data) continue
			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			continue
		}

		const photos = upd.message?.photo
		if (photos?.length) {
			const best = photos[photos.length - 1]
			return best.file_id
		}

		const doc = upd.message?.document
		if (doc && doc.mime_type?.startsWith('image/')) {
			return doc.file_id
		}

		await replaceBotMessage(ctx, 'Iltimos, rasm yuboring 📸', {
			parse_mode: 'Markdown',
			reply_markup: kb
		})
	}
}
