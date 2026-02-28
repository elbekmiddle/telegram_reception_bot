import { AnswerFieldType, FileType } from '@prisma/client'
import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'
import { type BotContext } from '../bot'
import { StepKey, PhotoRules } from '../../config/constants'
import { applicationService } from '../../services/application.service'
import { adminService } from '../../services/admin.service'
import { PhotoStep } from './photo.step'
import { Validators } from '../../utils/validators'
import { buildSummary } from '../../utils/format'
import { keyboards } from '../../utils/keyboards'
import { redisService } from '../../services/redis.service'

// Helper functions
type NavSignal = 'BACK' | 'CANCEL' | 'SKIP'

function isNavSignal(err: unknown): err is Error {
	return (
		err instanceof Error &&
		(err.message === 'BACK' || err.message === 'CANCEL' || err.message === 'SKIP')
	)
}

function popOrFirst(history: StepKey[], fallback: StepKey): StepKey {
	const next = history.pop()
	return next ?? fallback
}

function navError(sig: NavSignal): Error {
	return new Error(sig)
}

type InlineBtn = { text: string; data: string }
type AskInlineOpts = { back?: boolean; cancel?: boolean; columns?: number; deletePrev?: boolean }
type AskTextOpts = { back?: boolean; cancel?: boolean; skip?: boolean; deletePrev?: boolean }

let lastMessageId: number | null = null

async function deletePreviousMessage(ctx: BotContext) {
	if (lastMessageId && ctx.chat?.id) {
		try {
			await ctx.api.deleteMessage(ctx.chat.id, lastMessageId)
		} catch (error) {
			// Xabarni o'chirib bo'lmasa, ignore qilamiz
		}
	}
}

function buildInlineKb(buttons: InlineBtn[], opts?: AskInlineOpts): InlineKeyboard {
	const kb = new InlineKeyboard()
	const cols = opts?.columns ?? 2

	for (let i = 0; i < buttons.length; i++) {
		kb.text(buttons[i].text, buttons[i].data)
		if ((i + 1) % cols === 0) kb.row()
	}
	kb.row()
	if (opts?.back) kb.text('⬅️ Orqaga', 'NAV|BACK')
	if (opts?.cancel) kb.text('❌ Bekor qilish', 'NAV|CANCEL')
	return kb
}

async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: InlineBtn[],
	opts?: AskInlineOpts
): Promise<string> {
	if (opts?.deletePrev) {
		await deletePreviousMessage(ctx)
	}

	const sentMsg = await ctx.reply(question, { reply_markup: buildInlineKb(buttons, opts) })
	lastMessageId = sentMsg.message_id

	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery) {
			const sent = await ctx.reply('Iltimos, quyidagi tugmalardan birini tanlang 👇')
			lastMessageId = sent.message_id
			continue
		}
		await upd.answerCallbackQuery()
		const data = upd.callbackQuery.data

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === 'NAV|SKIP') throw navError('SKIP')

		return data
	}
}

function buildNavKb(opts?: AskTextOpts): InlineKeyboard | undefined {
	if (!opts?.back && !opts?.cancel && !opts?.skip) return undefined
	const kb = new InlineKeyboard()
	if (opts?.back) kb.text('⬅️ Orqaga', 'NAV|BACK')
	if (opts?.skip) kb.text('⏭ O‘tkazib yuborish', 'NAV|SKIP')
	if (opts?.cancel) kb.text('❌ Bekor qilish', 'NAV|CANCEL')
	return kb
}

async function askTextNav(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: AskTextOpts
): Promise<string> {
	if (!question) {
		question = 'Iltimos, matn kiriting:'
	}

	if (opts?.deletePrev) {
		await deletePreviousMessage(ctx)
	}

	const navKb = buildNavKb(opts)
	const sentMsg = await ctx.reply(question, navKb ? { reply_markup: navKb } : undefined)
	lastMessageId = sentMsg.message_id

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			await upd.answerCallbackQuery()
			const data = upd.callbackQuery.data

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			// Callback kelganda qo'shimcha xabar yubormaymiz
			continue
		}

		const text = upd.message?.text?.trim()
		if (text) return text

		if (upd.message?.photo) {
			const sent = await ctx.reply('Bu rasm, matn kerak edi. Iltimos, matn yozing 📝')
			lastMessageId = sent.message_id
			continue
		}

		if (upd.message?.document) {
			const sent = await ctx.reply('Bu fayl, matn kerak edi. Iltimos, matn yozing 📝')
			lastMessageId = sent.message_id
			continue
		}

		const sent = await ctx.reply('Iltimos, matn yuboring ✍️')
		lastMessageId = sent.message_id
	}
}

type MultiOpt = { key: string; label: string }
type AskMultiOpts = { back?: boolean; cancel?: boolean; deletePrev?: boolean }

function buildMultiKb(
	prefix: string,
	opts: MultiOpt[],
	selected: Set<string>,
	nav?: AskMultiOpts
): InlineKeyboard {
	const kb = new InlineKeyboard()
	for (const o of opts) {
		const on = selected.has(o.key)
		kb.text(`${on ? '✅ ' : ''}${o.label}`, `${prefix}|T|${o.key}`).row()
	}
	kb.text('✅ Tayyor', `${prefix}|DONE`).row()
	if (nav?.back) kb.text('⬅️ Orqaga', 'NAV|BACK')
	if (nav?.cancel) kb.text('❌ Bekor qilish', 'NAV|CANCEL')
	return kb
}

async function askMultiSelect(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	options: MultiOpt[],
	initial: Set<string>,
	nav?: AskMultiOpts
): Promise<Set<string>> {
	const prefix = 'M'
	const selected = new Set<string>(initial)

	if (nav?.deletePrev) {
		await deletePreviousMessage(ctx)
	}

	const sentMsg = await ctx.reply(question, {
		reply_markup: buildMultiKb(prefix, options, selected, nav)
	})
	lastMessageId = sentMsg.message_id

	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery) {
			const sent = await ctx.reply('Iltimos, quyidagi tugmalardan foydalaning 👇')
			lastMessageId = sent.message_id
			continue
		}

		await upd.answerCallbackQuery()
		const data = upd.callbackQuery.data

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')

		if (data === `${prefix}|DONE`) return selected

		const parts = data.split('|')
		if (parts.length === 3 && parts[0] === prefix && parts[1] === 'T') {
			const key = parts[2]
			if (selected.has(key)) selected.delete(key)
			else selected.add(key)

			// Tanlanganlarni ko'rsatish uchun xabarni yangilaymiz
			try {
				await ctx.api.editMessageText(ctx.chat!.id, lastMessageId!, question, {
					reply_markup: buildMultiKb(prefix, options, selected, nav)
				})
			} catch (error) {
				// Xatolik bo'lsa ignore qilamiz
			}
		}
	}
}

function nextStep(step: StepKey): StepKey {
	const order: StepKey[] = [
		StepKey.PERSON_FULL_NAME,
		StepKey.PERSON_BIRTHDATE,
		StepKey.PERSON_ADDRESS,
		StepKey.PERSON_PHONE,
		StepKey.EDU_TYPE,
		StepKey.EDU_SPECIALITY,
		StepKey.EDU_CERTS,
		StepKey.EXP_COMPANY,
		StepKey.EXP_DURATION,
		StepKey.EXP_POSITION,
		StepKey.EXP_LEAVE_REASON,
		StepKey.EXP_CAN_WORK_HOW_LONG,
		StepKey.SKILLS_COMPUTER,
		StepKey.FIT_COMMUNICATION,
		StepKey.FIT_CALLS,
		StepKey.FIT_CLIENT_EXP,
		StepKey.FIT_DRESS,
		StepKey.FIT_STRESS,
		StepKey.WORK_SHIFT,
		StepKey.WORK_SALARY,
		StepKey.WORK_START_DATE,
		StepKey.FILE_PHOTO_HALF_BODY,
		StepKey.FILE_PASSPORT_OPTIONAL,
		StepKey.FILE_RECOMMENDATION,
		StepKey.REVIEW_CONFIRM,
		StepKey.SUBMITTED
	]
	const i = order.indexOf(step)
	return i >= 0 ? order[Math.min(i + 1, order.length - 1)] : StepKey.SUBMITTED
}

export async function applicationFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return

	// 1) Redis dan sessiyani o'qish yoki yangi yaratish
	if (!ctx.session.applicationId) {
		const redisSession = await redisService.getSession(telegramId.toString())
		if (redisSession) {
			ctx.session = redisSession
		} else {
			const app = await applicationService.createApplication(telegramId)
			ctx.session.applicationId = app.id
			ctx.session.currentStep = StepKey.PERSON_FULL_NAME
			ctx.session.history = []
			ctx.session.temp = {}
			ctx.session.createdAt = Date.now()
			ctx.session.lastActivity = Date.now()

			await redisService.saveSession(telegramId.toString(), ctx.session)

			await ctx.reply(
				"✨ *Assalomu alaykum! Anketa to'ldirishni boshlaymiz*\n\n" +
					'Savollarga javob berish orqali ishga qabul jarayonini boshlaysiz. ' +
					"Har bir savolga to'g'ri va to'liq javob berishga harakat qiling.\n\n" +
					'🤝 *Yaxshi suhbat quring!*',
				{ parse_mode: 'Markdown' }
			)
		}
	}

	// 2) applicationId ni tekshirish (safety)
	const applicationId = ctx.session.applicationId
	if (!applicationId) {
		await ctx.reply("Xatolik yuz berdi. Iltimos, /start buyrug'i bilan qaytadan boshlang.")
		return
	}

	let step: StepKey = ctx.session.currentStep

	while (step !== StepKey.SUBMITTED) {
		try {
			ctx.session.lastActivity = Date.now()
			await redisService.saveSession(telegramId.toString(), ctx.session)

			switch (step) {
				case StepKey.PERSON_FULL_NAME: {
					const name = await askTextNav(
						conversation,
						ctx,
						'👤 *Ism-familiyangizni kiriting:*\n\nFaqat harflardan foydalaning. Masalan: *Alisher Karimov*',
						{ cancel: true, deletePrev: true }
					)

					const clean = Validators.sanitizeText(name)
					if (!Validators.validateName(clean)) {
						await ctx.reply(
							"😕 Kechirasiz, ism-familiya faqat harflardan iborat bo'lishi kerak.\n" +
								'Qaytadan kiriting:',
							{ parse_mode: 'Markdown' }
						)
						break
					}

					await applicationService.saveAnswer(
						applicationId,
						'full_name',
						clean,
						AnswerFieldType.TEXT
					)

					const sent = await ctx.reply(`✅ *Qabul qilindi:* ${clean}\n\n👉 Davom etamiz...`, {
						parse_mode: 'Markdown'
					})
					lastMessageId = sent.message_id

					ctx.session.history.push(step)
					step = StepKey.PERSON_BIRTHDATE
					break
				}

				case StepKey.PERSON_BIRTHDATE: {
					while (true) {
						const date = await askTextNav(
							conversation,
							ctx,
							"📅 *Tug'ilgan kuningiz:*\n\nFormat: *DD.MM.YYYY*\nMasalan: *24.03.2004*",
							{ back: true, cancel: true, deletePrev: true }
						)

						const clean = Validators.sanitizeText(date)
						const v = Validators.validateBirthDate(clean)

						if (!v.isValid) {
							await ctx.reply(
								"😕 Sana noto'g'ri formatda. To'g'ri format: *DD.MM.YYYY*\nMasalan: *24.03.2004*",
								{ parse_mode: 'Markdown' }
							)
							continue
						}

						await applicationService.saveAnswer(
							applicationId,
							'birth_date',
							clean,
							AnswerFieldType.DATE
						)

						const sent = await ctx.reply(`✅ Tug'ilgan kun: *${clean}*`, { parse_mode: 'Markdown' })
						lastMessageId = sent.message_id
						break
					}

					ctx.session.history.push(step)
					step = StepKey.PERSON_ADDRESS
					break
				}

				// ... SIZNING SWITCH ICHIDAGI QOLGAN CASE'LAR (o'zgarishsiz) ...

				case StepKey.REVIEW_CONFIRM: {
					const summary = await buildSummary(applicationId)

					const sent = await ctx.reply(
						'📄 *Anketa tayyor!*\n\n' +
							"Quyidagi ma'lumotlarni tekshirib chiqing:\n\n" +
							summary +
							"\n\nTasdiqlaysizmi yoki o'zgartirish kiritasizmi?",
						{
							parse_mode: 'Markdown',
							reply_markup: keyboards.confirmSubmit()
						}
					)
					lastMessageId = sent.message_id

					const u = await conversation.wait()

					if (!u.callbackQuery) {
						const sent2 = await ctx.reply('😕 Iltimos, quyidagi tugmalardan foydalaning 👇', {
							parse_mode: 'Markdown'
						})
						lastMessageId = sent2.message_id
						break
					}

					await u.answerCallbackQuery()

					if (u.callbackQuery.data === 'NAV|CANCEL') throw navError('CANCEL')

					if (u.callbackQuery.data === 'CONFIRM|EDIT') {
						step = popOrFirst(ctx.session.history, StepKey.PERSON_FULL_NAME)
						const sent3 = await ctx.reply(
							'✏️ *Anketani tahrirlash*\n\nQaysi qismdan davom etamiz?',
							{
								parse_mode: 'Markdown'
							}
						)
						lastMessageId = sent3.message_id
						break
					}

					if (u.callbackQuery.data === 'CONFIRM|SUBMIT') {
						await applicationService.submitApplication(applicationId)
						await adminService.sendToAdmin(ctx, applicationId)

						const sent4 = await ctx.reply(
							'✅ *Anketa topshirildi!*\n\n' +
								'Tabriklaymiz! Sizning anketangiz qabul qilindi.\n' +
								"Tez orada adminlarimiz siz bilan bog'lanadi.\n\n" +
								'🎯 *Omad tilaymiz!*',
							{ parse_mode: 'Markdown' }
						)
						lastMessageId = sent4.message_id

						step = StepKey.SUBMITTED
						break
					}

					break
				}

				default:
					step = StepKey.SUBMITTED
			}

			ctx.session.currentStep = step
			await redisService.saveSession(telegramId.toString(), ctx.session)
		} catch (err) {
			if (isNavSignal(err)) {
				const signal = err.message as NavSignal

				if (signal === 'CANCEL') {
					// safety: applicationId borligini tekshirib ishlatamiz
					await applicationService.cancelApplication(applicationId)

					ctx.session.applicationId = undefined
					ctx.session.currentStep = StepKey.PERSON_FULL_NAME
					ctx.session.history = []
					ctx.session.temp = {}

					await redisService.deleteSession(telegramId.toString())

					await ctx.reply(
						"❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start buyrug'ini bosing.",
						{ parse_mode: 'Markdown' }
					)
					return
				}

				if (signal === 'BACK') {
					step = popOrFirst(ctx.session.history, StepKey.PERSON_FULL_NAME)
					ctx.session.currentStep = step
					const sent = await ctx.reply('⬅️ *Oldingi qadamga qaytildi*', { parse_mode: 'Markdown' })
					lastMessageId = sent.message_id
					continue
				}

				if (signal === 'SKIP') {
					ctx.session.history.push(step)
					step = nextStep(step)
					ctx.session.currentStep = step
					const sent = await ctx.reply("⏭ *Qadam o'tkazib yuborildi*", { parse_mode: 'Markdown' })
					lastMessageId = sent.message_id
					continue
				}
			}

			throw err
		}
	}
}