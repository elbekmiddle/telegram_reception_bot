import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'
import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
export type NavSignal = 'BACK' | 'CANCEL' | 'SKIP' | 'START' | 'ADMIN' | 'TIMEOUT'

export const navError = (sig: NavSignal) => new Error(sig)

export function isNavSignal(err: unknown): err is Error {
	return (
		err instanceof Error &&
		['BACK', 'CANCEL', 'SKIP', 'START', 'ADMIN', 'TIMEOUT'].includes(err.message)
	)
}
const DEFAULT_WAIT_MS = 5 * 60 * 1000 // 5 min

async function waitWithTimeout<T>(promise: Promise<T>, ms = DEFAULT_WAIT_MS): Promise<T> {
	let timer: NodeJS.Timeout | undefined

	const timeoutPromise = new Promise<never>((_, reject) => {
timer = setTimeout(() => reject(navError('CANCEL')), ms)	})

	try {
		return await Promise.race([promise, timeoutPromise])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

function getUpdateId(upd: any): number {
	return Number(upd?.update?.update_id ?? upd?.updateId ?? 0)
}

function getLastConsumedUpdateId(ctx: BotContext): number {
	return Number((ctx.session.temp as any)?.lastConsumedUpdateId ?? 0)
}

function setLastConsumedUpdateId(ctx: BotContext, upd: any) {
	ctx.session.temp ??= {} as any
	;(ctx.session.temp as any).lastConsumedUpdateId = getUpdateId(upd)
}

function isFreshUpdate(ctx: BotContext, upd: any): boolean {
	const current = getUpdateId(upd)
	const last = getLastConsumedUpdateId(ctx)
	return current > last
}

function isSameActor(ctx: BotContext, upd: any): boolean {
	const expectedUserId = ctx.from?.id
	const expectedChatId = ctx.chat?.id

	if (expectedUserId && upd.from?.id && upd.from.id !== expectedUserId) return false
	if (expectedChatId && upd.chat?.id && upd.chat.id !== expectedChatId) return false
	if (expectedChatId && upd.message?.chat?.id && upd.message.chat.id !== expectedChatId)
		return false
	if (
		expectedChatId &&
		upd.callbackQuery?.message?.chat?.id &&
		upd.callbackQuery.message.chat.id !== expectedChatId
	) {
		return false
	}

	return true
}

async function safeWait(conversation: Conversation<BotContext>, ms = DEFAULT_WAIT_MS) {
	return await waitWithTimeout(conversation.wait(), ms)
}

async function replySoft(
	ctx: BotContext,
	text: string,
	options?: Parameters<BotContext['reply']>[1]
) {
	try {
		return await ctx.reply(text, options)
	} catch (err) {
		logger.warn({ err }, 'replySoft failed')
		return null
	}
}
/**
 * Delete previous bot message
 */
export async function deletePrevBotMessage(ctx: BotContext) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (!msgId || !chatId) return
	try {
		await ctx.api.deleteMessage(chatId, msgId)
	} catch {
		// ignore
	}
}

/**
 * Replace bot message (delete old, send new)
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
 * Build inline keyboard
 */
export function buildInlineKb(
	buttons: { text: string; data: string }[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
) {
	const kb = new InlineKeyboard()
	const cols = opts?.columns ?? 2

	// Main buttons
	for (let i = 0; i < buttons.length; i++) {
		kb.text(buttons[i].text, buttons[i].data)
		if ((i + 1) % cols === 0 && i !== buttons.length - 1) {
			kb.row()
		}
	}

	if (buttons.length % cols !== 0 || buttons.length === 0) {
		kb.row()
	}

	// Navigation buttons
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

// export async function askText(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext,
// 	question: string,
// 	opts?: {
// 		back?: boolean
// 		cancel?: boolean
// 		skip?: boolean
// 		validate?: (value: string) => string | null
// 	}
// ): Promise<string> {
// 	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined

// 	const sent = await replaceBotMessage(
// 		ctx,
// 		question,
// 		navKb ? { parse_mode: 'Markdown', reply_markup: navKb } : { parse_mode: 'Markdown' }
// 	)

// 	const promptMessageId = sent.message_id

// 	while (true) {
// 		const upd = await safeWait(conversation)

// 		if (!isSameActor(ctx, upd)) continue

// 		if (upd.callbackQuery) {
// 			const data = upd.callbackQuery.data
// 			if (!data) continue

// 			await upd.answerCallbackQuery().catch(() => {})

// 			if (data === 'NAV|BACK') throw navError('BACK')
// 			if (data === 'NAV|CANCEL') throw navError('CANCEL')
// 			if (data === 'NAV|SKIP') throw navError('SKIP')

// 			continue
// 		}

// 		const msg = upd.message
// 		if (!msg?.text) continue

// 		// Eski queued xabarlarni kesish
// 		if (msg.message_id <= promptMessageId) {
// 			logger.warn(
// 				{
// 					text: msg.text,
// 					msgMessageId: msg.message_id,
// 					promptMessageId
// 				},
// 				'Ignoring stale text update in askText by message_id'
// 			)
// 			continue
// 		}

// 		const text = msg.text.trim()
// 		if (!text) continue

// 		if (text === '/start') throw navError('START')
// 		if (text === '/admin') throw navError('ADMIN')
// 		if (text === '/cancel') throw navError('CANCEL')
// 		if (text === '⬅️ Orqaga') throw navError('BACK')
// 		if (text === '❌ Bekor qilish') throw navError('CANCEL')

// 		if (opts?.validate) {
// 			const validationError = opts.validate(text)
// 			if (validationError) {
// 				await ctx.reply(validationError, {
// 					parse_mode: 'Markdown',
// 					reply_markup: navKb
// 				})
// 				continue
// 			}
// 		}

// 		return text
// 	}
// }
export async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: {
		back?: boolean
		cancel?: boolean
		skip?: boolean
		validate?: (value: string) => string | null
	}
): Promise<string> {
	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined

	await replaceBotMessage(
		ctx,
		question,
		navKb ? { parse_mode: 'Markdown', reply_markup: navKb } : { parse_mode: 'Markdown' }
	)

	while (true) {
		const upd = await safeWait(conversation)

		if (!isSameActor(ctx, upd)) continue
		if (!isFreshUpdate(ctx, upd)) {
			logger.warn(
				{
					updateId: getUpdateId(upd),
					lastConsumedUpdateId: getLastConsumedUpdateId(ctx),
					text: upd.message?.text
				},
				'Ignoring stale update in askText by update_id'
			)
			continue
		}

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})

			setLastConsumedUpdateId(ctx, upd)

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			continue
		}

		const msg = upd.message
		if (!msg?.text) continue

		const text = msg.text.trim()
		if (!text) continue

		setLastConsumedUpdateId(ctx, upd)

		if (text === '/start') throw navError('START')
		if (text === '/admin') throw navError('ADMIN')
		if (text === '/cancel') throw navError('CANCEL')
		if (text === '⬅️ Orqaga') throw navError('BACK')
		if (text === '❌ Bekor qilish') throw navError('CANCEL')

		if (opts?.validate) {
			const validationError = opts.validate(text)
			if (validationError) {
				await ctx.reply(validationError, {
					parse_mode: 'Markdown',
					reply_markup: navKb
				})
				continue
			}
		}

		return text
	}
}
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

	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})

	while (true) {
		const upd = await safeWait(conversation)

		if (!isSameActor(ctx, upd)) continue
		if (!isFreshUpdate(ctx, upd)) continue

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})
			setLastConsumedUpdateId(ctx, upd)

			if (data === 'NAV|BACK') return null
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			if (!allowedData.has(data)) continue

			return data
		}

		const text = upd.message?.text?.trim()
		if (text) {
			setLastConsumedUpdateId(ctx, upd)

			if (text === '/start') throw navError('START')
			if (text === '/admin') throw navError('ADMIN')
			if (text === '/cancel') throw navError('CANCEL')

			await ctx.reply('Iltimos, quyidagi tugmalardan birini tanlang 👇', {
				parse_mode: 'Markdown',
				reply_markup: kb
			})
		}
	}
}
// export async function askPhone(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext,
// 	question: string,
// 	opts?: { back?: boolean; cancel?: boolean }
// ): Promise<string> {
// 	const replyKeyboard = new Keyboard().requestContact('📱 Telefon raqamni yuborish').row()

// 	if (opts?.back) {
// 		replyKeyboard.text('⬅️ Orqaga')
// 	}
// 	if (opts?.cancel) {
// 		replyKeyboard.text('❌ Bekor qilish')
// 	}

// 	replyKeyboard.resized().oneTime()

// 	await replaceBotMessage(ctx, question, {
// 		parse_mode: 'Markdown',
// 		reply_markup: replyKeyboard
// 	})

// 	while (true) {
// 		const upd = await conversation.wait()

// 		if (upd.callbackQuery) {
// 			const data = upd.callbackQuery.data
// 			if (!data) continue

// 			await upd.answerCallbackQuery().catch(() => {})

// 			if (data === 'NAV|BACK') throw navError('BACK')
// 			if (data === 'NAV|CANCEL') throw navError('CANCEL')
// 			continue
// 		}

// 		if (upd.message?.contact) {
// 			const phoneNumber = upd.message.contact.phone_number
// 			const clean = phoneNumber.replace(/\D/g, '')
// 			return clean.startsWith('998') ? `+${clean}` : `+${clean}`
// 		}

// 		const text = upd.message?.text?.trim()
// 		if (text) {
// 			if (text === '/start') throw navError('START')
// 			if (text === '/admin') throw navError('ADMIN')
// 			if (text === '/cancel') throw navError('CANCEL')
// 			if (text === '⬅️ Orqaga') throw navError('BACK')
// 			if (text === '❌ Bekor qilish') throw navError('CANCEL')

// 			const cleaned = text.replace(/[^\d+]/g, '')
// 			if (!/^\+?\d{9,15}$/.test(cleaned)) {
// 				await replaceBotMessage(
// 					ctx,
// 					'📞 Telefon raqamni to‘g‘ri kiriting.\n\nMasalan: +998901234567'
// 				)
// 				continue
// 			}

// 			return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
// 		}

// 		await replaceBotMessage(ctx, 'Iltimos, telefon raqamingizni yozing yoki tugmani bosing 📱')
// 	}
// }

export async function askPhone(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: { back?: boolean; cancel?: boolean }
): Promise<string> {
	const replyKeyboard = new Keyboard().requestContact('📱 Telefon raqamni yuborish').row()

	if (opts?.back) replyKeyboard.text('⬅️ Orqaga')
	if (opts?.cancel) replyKeyboard.text('❌ Bekor qilish')

	replyKeyboard.resized().oneTime()

	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: replyKeyboard
	})

	while (true) {
		const upd = await safeWait(conversation)

		if (!isSameActor(ctx, upd)) continue
		if (!isFreshUpdate(ctx, upd)) continue

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})
			setLastConsumedUpdateId(ctx, upd)

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			continue
		}

		if (upd.message?.contact) {
			setLastConsumedUpdateId(ctx, upd)
			const phoneNumber = upd.message.contact.phone_number
			const clean = phoneNumber.replace(/\D/g, '')
			return clean.startsWith('998') ? `+${clean}` : `+${clean}`
		}

		const text = upd.message?.text?.trim()
		if (text) {
			setLastConsumedUpdateId(ctx, upd)

			if (text === '/start') throw navError('START')
			if (text === '/admin') throw navError('ADMIN')
			if (text === '/cancel') throw navError('CANCEL')
			if (text === '⬅️ Orqaga') throw navError('BACK')
			if (text === '❌ Bekor qilish') throw navError('CANCEL')

			const cleaned = text.replace(/[^\d+]/g, '')
			if (!/^\+?\d{9,15}$/.test(cleaned)) {
				await ctx.reply('📞 Telefon raqamni to‘g‘ri kiriting.\n\nMasalan: +998901234567')
				continue
			}

			return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
		}

		await ctx.reply('Iltimos, telefon raqamingizni yozing yoki tugmani bosing 📱')
	}
}

/**
 * Ask inline button choice (old version, kept for compatibility)
 */
export async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: { text: string; data: string }[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
): Promise<string> {
	 logger.info({ question, buttonsCount: buttons.length }, 'askInline called')

		const result = await askChoice(conversation, ctx, question, buttons, opts)

		logger.info({ result }, 'askInline got result')

		if (result === null) throw navError('BACK')
		return result
}

/**
 * Ask multi-select choice
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

export async function askPhoto(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string
): Promise<string> {
	const kb = new InlineKeyboard()
		.text('⬅️ Orqaga', 'NAV|BACK')
		.text('❌ Bekor qilish', 'NAV|CANCEL')

	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})

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

		const msg = upd.message
		if (!msg) continue

		// Log the received message for debugging (optional)
		logger.info(
			{
				hasMessage: true,
				hasPhoto: Boolean(msg.photo?.length),
				hasDocument: Boolean(msg.document),
				text: msg.text
			},
			'askPhoto update received'
		)

		// Check if it's a photo (regular photo)
		const photos = msg.photo
		if (photos?.length) {
			const best = photos[photos.length - 1]
			logger.info({ fileId: best.file_id }, '✅ Photo accepted')
			return best.file_id
		}

		// Check if it's a document that is an image
		const doc = msg.document
		if (doc) {
			const mimeType = doc.mime_type || ''
			const fileName = doc.file_name || ''

			// Check if it's an image by mime type or file extension
			if (mimeType.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName)) {
				logger.info({ fileId: doc.file_id, mimeType, fileName }, '✅ Image document accepted')
				return doc.file_id
			}

			// If it's a document but not an image - silently ignore
			continue
		}

		// If it's text or any other media type - silently ignore, continue waiting
		continue
	}
}