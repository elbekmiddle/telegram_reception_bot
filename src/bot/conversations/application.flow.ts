import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'
import { AnswerFieldType, FileType } from '@prisma/client'

import type { BotContext } from '../bot'
import { StepKey, PhotoRules } from '../../config/constants'
import { applicationService } from '../../services/application.service'
import { vacancyService } from '../../services/vacancy.service'
import { PhotoStep } from './photo.step'
import { Validators } from '../../utils/validators'
import { buildAdminSummary } from '../../utils/format'
import { keyboards } from '../../utils/keyboards'
import { logger } from '../../utils/logger'
import { SessionData } from '../../types/session'
 type NavSignal = 'BACK' | 'CANCEL' | 'SKIP'
const navError = (sig: NavSignal) => new Error(sig)

function isNavSignal(err: unknown): err is Error {
	return (
		err instanceof Error &&
		(err.message === 'BACK' || err.message === 'CANCEL' || err.message === 'SKIP')
	)
}
function getFieldType(key: string): AnswerFieldType {
	const multiChoiceFields = ['certificates', 'computer_skills']
	const singleChoiceFields = [
		'marital_status',
		'education_type',
		'communication_skill',
		'can_answer_calls',
		'client_experience',
		'dress_code',
		'stress_tolerance',
		'work_shift',
		'exp_has'
	]
	const phoneFields = ['phone']

	if (multiChoiceFields.includes(key)) {
		return AnswerFieldType.MULTI_CHOICE
	} else if (singleChoiceFields.includes(key)) {
		return AnswerFieldType.SINGLE_CHOICE
	} else if (phoneFields.includes(key)) {
		return AnswerFieldType.PHONE
	} else {
		return AnswerFieldType.TEXT
	}
}

function popOrFirst(history: StepKey[], fallback: StepKey): StepKey {
	const next = history.pop()
	return next ?? fallback
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

async function replaceBotMessage(
	ctx: BotContext,
	text: string,
	options?: Parameters<BotContext['reply']>[1]
) {
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

type InlineBtn = { text: string; data: string }

function buildInlineKb(
	buttons: InlineBtn[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
) {
	const kb = new InlineKeyboard()
	const cols = opts?.columns ?? 2

	// Asosiy tugmalarni qo'shish
	for (let i = 0; i < buttons.length; i++) {
		kb.text(buttons[i].text, buttons[i].data)
		// Agar kerakli sonda tugma qo'shilgan bo'lsa va bu oxirgi tugma bo'lmasa, yangi qatorga o'tish
		if ((i + 1) % cols === 0 && i !== buttons.length - 1) {
			kb.row()
		}
	}

	// Agar tugmalar soni cols ga karrali bo'lmasa, oxirgi qatorni tugatish
	if (buttons.length % cols !== 0 || buttons.length === 0) {
		kb.row()
	}

	// Navigatsiya tugmalarini qo'shish
	if (opts?.skip) {
		kb.text('⏭ O‘tkazib yuborish', 'NAV|SKIP')
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

type MultiOpt = { key: string; label: string }

function buildMultiKb(
	prefix: string,
	opts: MultiOpt[],
	selected: Set<string>,
	nav?: { back?: boolean; cancel?: boolean }
) {
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
async function askPhone(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: { back?: boolean; cancel?: boolean }
): Promise<string> {
	// Reply keyboard yaratish (kontakt tugmasi bilan)
	const replyKeyboard = new Keyboard().requestContact('📱 Telefon raqamni yuborish').row()

	if (opts?.back) {
		replyKeyboard.text('⬅️ Orqaga')
	}
	if (opts?.cancel) {
		replyKeyboard.text('❌ Bekor qilish')
	}

	replyKeyboard.resized().oneTime()

	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: replyKeyboard
	})

	while (true) {
		const upd = await conversation.wait()

		// Callback querylarni tekshirish - faqat navigatsiya uchun
		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery()

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			continue
		}

		// Contact yuborilgan bo'lsa
		if (upd.message?.contact) {
			const phoneNumber = upd.message.contact.phone_number
			// Formatlash
			let clean = phoneNumber.replace(/\D/g, '')
			if (clean.startsWith('8')) clean = '7' + clean.slice(1)
			if (!clean.startsWith('+')) clean = '+' + clean
			return clean
		}

		// Matn yuborilgan bo'lsa
		const text = upd.message?.text?.trim()
		if (text) {
			if (text === '/start' || text === '/admin' || text === '/cancel') {
				throw navError('CANCEL')
			}

			// Navigatsiya tugmalarini tekshirish
			if (text === '⬅️ Orqaga') throw navError('BACK')
			if (text === '❌ Bekor qilish') throw navError('CANCEL')

			return text
		}

		await replaceBotMessage(
			ctx,
			'Iltimos, telefon raqamingizni yozing yoki kontakt tugmasini bosing 📱'
		)
	}
}

async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: InlineBtn[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
): Promise<string> {
	// Avval eski xabarni o'chirib, yangisini yuboramiz
	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: buildInlineKb(buttons, opts)
	})

	while (true) {
		// Foydalanuvchidan javob kutamiz
		const upd = await conversation.wait()

		// Callback query kelganligini tekshiramiz
		if (!upd.callbackQuery) {
			// Agar callback query bo'lmasa, matn yoki boshqa narsa yuborilgan
			if (upd.message?.text) {
				await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan birini tanlang 👇')
			} else {
				await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan birini tanlang 👇')
			}
			continue
		}

		// Callback data ni olamiz
		const data = upd.callbackQuery.data
		if (!data) continue

		// MUHIM: Callback query ni DARHOL answer qilish
		try {
			await upd.answerCallbackQuery()
		} catch (err) {
			logger.warn({ err, userId: ctx.from?.id }, 'Failed to answer callback query in askInline')
		}

		// Navigatsiya tugmalarini tekshiramiz
		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === 'NAV|SKIP') throw navError('SKIP')

		// Tanlangan variantni qaytaramiz
		return data
	}
}

async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: {
		back?: boolean
		cancel?: boolean
		skip?: boolean
		requestContact?: boolean
		oneTime?: boolean
	}
): Promise<string> {
	// Faqat inline navigation tugmalarini yaratish (agar kerak bo'lsa)
	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined

	// Agar requestContact true bo'lsa, reply keyboard yaratamiz
	if (opts?.requestContact) {
		const replyKeyboard = new Keyboard().requestContact('📱 Telefon raqamni yuborish').row()

		if (opts?.back) {
			replyKeyboard.text('⬅️ Orqaga')
		}
		if (opts?.cancel) {
			replyKeyboard.text('❌ Bekor qilish')
		}

		replyKeyboard.resized()
		if (opts?.oneTime) {
			replyKeyboard.oneTime()
		}

		await replaceBotMessage(ctx, question, {
			parse_mode: 'Markdown',
			reply_markup: replyKeyboard
		})
	} else {
		// Inline keyboard bilan (faqat navigatsiya tugmalari)
		await replaceBotMessage(
			ctx,
			question,
			navKb ? { parse_mode: 'Markdown', reply_markup: navKb } : { parse_mode: 'Markdown' }
		)
	}

	while (true) {
		const upd = await conversation.wait()

		// Callback querylarni tekshirish - FAQAT navigatsiya tugmalari uchun
		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			if (!data) continue

			// MUHIM: Callback query ni DARHOL answer qilish
			try {
				await upd.answerCallbackQuery()
			} catch (err) {
				logger.warn({ err, userId: ctx.from?.id }, 'Failed to answer callback query in askText')
			}

			// Faqat navigatsiya tugmalarini qabul qilish
			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			// Boshqa callback querylar ignore qilinadi (askInline uchun)
			continue
		}

		// Contact yuborilgan bo'lsa
		if (upd.message?.contact) {
			const phoneNumber = upd.message.contact.phone_number
			// +998 XX XXX XX XX formatiga keltirish
			let clean = phoneNumber.replace(/\D/g, '')
			if (clean.startsWith('8')) clean = '7' + clean.slice(1)
			if (!clean.startsWith('+')) clean = '+' + clean
			return clean
		}

		// Matn yuborilgan bo'lsa
		const text = upd.message?.text?.trim()
		if (text) {
			if (text === '/start' || text === '/admin' || text === '/cancel') {
				throw navError('CANCEL')
			}

			// Reply keyboard dagi tugmalarni tekshirish
			if (text === '⬅️ Orqaga') throw navError('BACK')
			if (text === '❌ Bekor qilish') throw navError('CANCEL')

			return text
		}

		await replaceBotMessage(ctx, 'Iltimos, matn yuboring yoki kontakt tugmasini bosing ✍️')
	}
}

async function askMultiSelect(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	options: MultiOpt[],
	initial: Set<string>,
	nav?: { back?: boolean; cancel?: boolean }
): Promise<Set<string>> {
	const prefix = 'M'
	const selected = new Set<string>(initial)

	const sent = await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: buildMultiKb(prefix, options, selected, nav)
	})

	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery) {
			await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan foydalaning 👇')
			continue
		}

		await upd.answerCallbackQuery()
		const data = upd.callbackQuery.data
		if (!data) continue

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === `${prefix}|DONE`) return selected

		const parts = data.split('|')
		if (parts.length === 3 && parts[0] === prefix && parts[1] === 'T') {
			const key = parts[2]
			if (selected.has(key)) selected.delete(key)
			else selected.add(key)

			try {
				await ctx.api.editMessageText(ctx.chat!.id, sent.message_id, question, {
					parse_mode: 'Markdown',
					reply_markup: buildMultiKb(prefix, options, selected, nav)
				})
				ctx.session.lastBotMessageId = sent.message_id
			} catch {
				await replaceBotMessage(ctx, question, {
					parse_mode: 'Markdown',
					reply_markup: buildMultiKb(prefix, options, selected, nav)
				})
			}
		}
	}
}

async function askFile(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	allowedSkip: boolean
): Promise<{ telegramFileId: string; kind: 'photo' | 'document' } | null> {
	const kb = new InlineKeyboard()
		.text('⬅️ Orqaga', 'NAV|BACK')
		.text(allowedSkip ? '⏭ O‘tkazib yuborish' : ' ', allowedSkip ? 'NAV|SKIP' : 'NAV|NOOP')
		.text('❌ Bekor qilish', 'NAV|CANCEL')

	await replaceBotMessage(ctx, question, { parse_mode: 'Markdown', reply_markup: kb })

	while (true) {
		const upd = await conversation.wait()
		if (upd.callbackQuery) {
			await upd.answerCallbackQuery()
			const data = upd.callbackQuery.data
			if (!data) continue
			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') return null
			continue
		}

		const photos = upd.message?.photo
		if (photos?.length) {
			const best = photos[photos.length - 1]
			return { telegramFileId: best.file_id, kind: 'photo' }
		}
		const doc = upd.message?.document
		if (doc) return { telegramFileId: doc.file_id, kind: 'document' }

		await replaceBotMessage(ctx, 'Iltimos, rasm yoki fayl yuboring.')
	}
}

async function askSingleSelect(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	options: MultiOpt[],
	nav?: { back?: boolean; cancel?: boolean; skip?: boolean }
): Promise<string> {
	const prefix = 'S'

	const kb = new InlineKeyboard()
	for (const o of options) {
		kb.text(o.label, `${prefix}|${o.key}`).row()
	}

	if (nav?.skip) {
		kb.text('⏭ O‘tkazib yuborish', 'NAV|SKIP')
		kb.row()
	}
	if (nav?.back) {
		kb.text('⬅️ Orqaga', 'NAV|BACK')
		kb.row()
	}
	if (nav?.cancel) {
		kb.text('❌ Bekor qilish', 'NAV|CANCEL')
	}

	await replaceBotMessage(ctx, question, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})

	while (true) {
		const upd = await conversation.wait()

		if (!upd.callbackQuery) {
			await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan birini tanlang 👇')
			continue
		}

		try {
			await upd.answerCallbackQuery()
		} catch (err) {
			logger.warn(
				{ err, userId: ctx.from?.id },
				'Failed to answer callback query in askSingleSelect'
			)
		}

		const data = upd.callbackQuery.data
		if (!data) continue

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === 'NAV|SKIP') throw navError('SKIP')

		if (data.startsWith(`${prefix}|`)) {
			return data.replace(`${prefix}|`, '')
		}
	}
}

function nextStep(step: StepKey): StepKey {
	const order: StepKey[] = [
		StepKey.PERSON_FULL_NAME,
		StepKey.PERSON_BIRTHDATE,
		StepKey.PERSON_ADDRESS,
		StepKey.PERSON_PHONE,
		StepKey.PERSON_MARITAL_STATUS,
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

function calculateAgeFromBirthDate(date: string): number | null {
	const m = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
	if (!m) return null

	const day = parseInt(m[1], 10)
	const month = parseInt(m[2], 10)
	const year = parseInt(m[3], 10)

	if (
		day < 1 ||
		day > 31 ||
		month < 1 ||
		month > 12 ||
		year < 1900 ||
		year > new Date().getFullYear()
	) {
		return null
	}

	const today = new Date()
	const birthDate = new Date(year, month - 1, day)

	let age = today.getFullYear() - birthDate.getFullYear()
	const monthDiff = today.getMonth() - birthDate.getMonth()

	if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
		age--
	}

	return age >= 0 ? age : null
}
export async function applicationFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return

	// Temp ni to'g'ri init qilish
	if (!ctx.session.temp) {
		ctx.session.temp = {} as SessionData['temp']
	}

	// answers obyektini init qilish (agar yo'q bo'lsa)
	if (!ctx.session.temp.answers) {
		ctx.session.temp.answers = {}
	}

	if (!ctx.session.applicationId) {
		const app = await applicationService.createApplication(telegramId)
		ctx.session.applicationId = app.id
		ctx.session.currentStep = StepKey.PERSON_FULL_NAME
		ctx.session.history = []
		ctx.session.temp = {
			answers: {} // Barcha javoblar shu yerda to'planadi
		}
		ctx.session.createdAt = Date.now()
		ctx.session.lastActivity = Date.now()

		await replaceBotMessage(
			ctx,
			[
				"✨ *Assalomu alaykum! Anketa to'ldirishni boshlaymiz*",
				'',
				'Savollarga javob berish orqali ishga qabul jarayonini boshlaysiz.',
				"Har bir savolga to'g'ri va to'liq javob bering.",
				'',
				'Boshlash uchun birinchi savolga javob bering 👇'
			].join('\n'),
			{ parse_mode: 'Markdown' }
		)
	}

	const applicationId = ctx.session.applicationId
	if (!applicationId) {
		await replaceBotMessage(ctx, 'Xatolik. Iltimos, /start bilan qayta boshlang.')
		return
	}

	// Vacancy tanlash
	if (!ctx.session.temp.vacancyPicked) {
		const vacancies = await vacancyService.listActive()
		if (vacancies.length > 0) {
			const buttons = vacancies
				.slice(0, 12)
				.map((v: { id: string; title: string }) => ({ text: v.title, data: `VAC|${v.id}` }))
			const picked = await askInline(
				conversation,
				ctx,
				'📌 *Qaysi vakansiyaga topshirasiz?*',
				buttons,
				{ cancel: true, columns: 1 }
			)
			if (picked.startsWith('VAC|')) {
				const vacancyId = picked.replace('VAC|', '')
				ctx.session.temp.vacancyId = vacancyId
				await applicationService.setVacancy(applicationId, vacancyId)
			}
		}
		ctx.session.temp.vacancyPicked = true
	}

	let step: StepKey = ctx.session.currentStep

	while (step !== StepKey.SUBMITTED) {
		try {
			ctx.session.lastActivity = Date.now()

			switch (step) {
				case StepKey.PERSON_FULL_NAME: {
					const name = await askText(
						conversation,
						ctx,
						'👤 *Ism, familiyangizni kiriting:*\n\nMasalan: *Alisher Karimov*',
						{ cancel: true, oneTime: true }
					)
					const clean = Validators.sanitizeText(name)
					if (!Validators.validateName(clean)) {
						await replaceBotMessage(ctx, "😕 Ism-familiya noto'g'ri. Qaytadan kiriting.")
						break
					}
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.full_name = clean
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.PERSON_BIRTHDATE: {
					const date = await askText(
						conversation,
						ctx,
						"📅 *Tug'ilgan sanangiz:*\n\nFormat: *DD.MM.YYYY* (masalan: *24.03.2004*)",
						{ back: true, cancel: true, oneTime: true }
					)

					const clean = Validators.normalizeBirthDate(date)
					const v = Validators.validateBirthDate(clean)

					if (!v.isValid) {
						await replaceBotMessage(ctx, "😕 Sana noto'g'ri formatda. Masalan: *24.03.2004*", {
							parse_mode: 'Markdown'
						})
						break
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.birth_date = clean

					const age = calculateAgeFromBirthDate(clean)
					if (age !== null) {
						ctx.session.temp.answers.birth_age = String(age)
					}

					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.PERSON_ADDRESS: {
					const addr = await askText(
						conversation,
						ctx,
						'📍 *Yashash manzilingiz (shahar/tuman):*\n\nMasalan: *Toshkent, Chilonzor*',
						{ back: true, cancel: true, oneTime: true }
					)
					const clean = Validators.sanitizeText(addr)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.address = clean
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.PERSON_PHONE: {
					const phone = await askPhone(
						conversation,
						ctx,
						'📞 *Telefon raqamingiz:*\n\n' +
							'Raqamingizni yozing (masalan: *+998901234567*) yoki quyidagi tugma orqali yuboring 👇',
						{ back: true, cancel: true }
					)

					const clean = Validators.sanitizeText(phone)
					if (!Validators.validatePhone(clean)) {
						await replaceBotMessage(ctx, "😕 Telefon raqam noto'g'ri. Masalan: *+998901234567*", {
							parse_mode: 'Markdown'
						})
						break
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.phone = clean
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.PERSON_MARITAL_STATUS: {
					const data = await askInline(
						conversation,
						ctx,
						'💍 *Oilaviy holatingiz?*',
						[
							{ text: 'Bo‘ydoq / Turmush qurmagan', data: 'MAR|SINGLE' },
							{ text: 'Uylangan / Turmush qurgan', data: 'MAR|MARRIED' },
							{ text: 'Ajrashgan', data: 'MAR|DIVORCED' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.marital_status = data
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EDU_TYPE: {
					const data = await askInline(
						conversation,
						ctx,
						'🎓 *Oxirgi tugatgan o‘quv yurt turi?*',
						[
							{ text: '🏫 Maktab', data: 'EDU|SCHOOL' },
							{ text: '🏢 Kollej', data: 'EDU|COLLEGE' },
							{ text: '🎓 Oliy ta’lim', data: 'EDU|HIGHER' }
						],
						{ back: true, cancel: true, columns: 1 }
					)

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.education_type = data
					ctx.session.temp.educationType = data
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EDU_SPECIALITY: {
					const eduType = ctx.session.temp.educationType

					if (eduType === 'EDU|SCHOOL') {
						// VAQTINCHALIK SAQLASH
						ctx.session.temp.answers.speciality = "Umumiy o'rta ta'lim"
						ctx.session.history.push(step)
						step = nextStep(step)
						break
					}

					let question = ''
					let buttons: InlineBtn[] = []

					if (eduType === 'EDU|COLLEGE') {
						question = "🏢 *Kollejda qaysi yo'nalishda o'qigansiz?*"
						buttons = [
							{ text: '💻 Dasturlash', data: 'SPEC|PROGRAMMING' },
							{ text: '📊 Buxgalteriya', data: 'SPEC|ACCOUNTING' },
							{ text: '🏥 Tibbiyot', data: 'SPEC|MEDICAL' },
							{ text: '🔧 Mexanika', data: 'SPEC|MECHANICS' },
							{ text: '👩‍🏫 Pedagogika', data: 'SPEC|PEDAGOGY' },
							{ text: '🏨 Turizm', data: 'SPEC|TOURISM' },
							{ text: '⚡ Elektronika', data: 'SPEC|ELECTRONICS' },
							{ text: '✍️ Boshqa', data: 'SPEC|OTHER' }
						]
					} else {
						question = "🎓 *Oliy ma'lumot yo'nalishingiz?*"
						buttons = [
							{ text: '💻 Dasturlash / IT', data: 'SPEC|PROGRAMMING' },
							{ text: '📊 Iqtisodiyot', data: 'SPEC|ECONOMICS' },
							{ text: '📚 Filologiya', data: 'SPEC|PHILOLOGY' },
							{ text: '🔬 Tibbiyot', data: 'SPEC|MEDICAL' },
							{ text: '⚖️ Huquq', data: 'SPEC|LAW' },
							{ text: '👩‍🏫 Pedagogika', data: 'SPEC|PEDAGOGY' },
							{ text: '🔧 Muhandislik', data: 'SPEC|ENGINEERING' },
							{ text: "🎨 San'at", data: 'SPEC|ART' },
							{ text: '✍️ Boshqa', data: 'SPEC|OTHER' }
						]
					}

					const selected = await askInline(conversation, ctx, question, buttons, {
						back: true,
						cancel: true,
						columns: 2
					})

					let speciality = ''

					if (selected === 'SPEC|PROGRAMMING') speciality = 'Dasturlash / IT'
					else if (selected === 'SPEC|ACCOUNTING') speciality = 'Buxgalteriya'
					else if (selected === 'SPEC|ECONOMICS') speciality = 'Iqtisodiyot'
					else if (selected === 'SPEC|PHILOLOGY') speciality = 'Filologiya'
					else if (selected === 'SPEC|MEDICAL') speciality = 'Tibbiyot'
					else if (selected === 'SPEC|MECHANICS') speciality = 'Mexanika'
					else if (selected === 'SPEC|PEDAGOGY') speciality = 'Pedagogika'
					else if (selected === 'SPEC|TOURISM') speciality = 'Turizm'
					else if (selected === 'SPEC|ELECTRONICS') speciality = 'Elektronika'
					else if (selected === 'SPEC|LAW') speciality = 'Huquq'
					else if (selected === 'SPEC|ENGINEERING') speciality = 'Muhandislik'
					else if (selected === 'SPEC|ART') speciality = "San'at"
					else if (selected === 'SPEC|OTHER') {
						speciality = await askText(conversation, ctx, '✍️ *Mutaxassisligingizni yozing:*', {
							back: true,
							cancel: true,
							oneTime: true
						})
					} else {
						speciality = selected.replace('SPEC|', '')
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.speciality = speciality
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EDU_CERTS: {
					const eduType = ctx.session.temp.educationType

					if (eduType === 'EDU|SCHOOL') {
						// Maktab o'quvchilari uchun sertifikat yo'q
						ctx.session.temp.answers.certificates = []
						ctx.session.temp.answers.certificates_level = {}
						ctx.session.history.push(step)
						step = nextStep(step)
						break
					}

					// Sertifikat variantlari
					const certOptions: MultiOpt[] = [
						{ key: 'ENGLISH', label: '🇬🇧 Ingliz tili' },
						{ key: 'ARABIC', label: '🇸🇦 Arab tili' },
						{ key: 'RUSSIAN', label: '🇷🇺 Rus tili' },
						{ key: 'GERMAN', label: '🇩🇪 Nemis tili' },
						{ key: 'KOREAN', label: '🇰🇷 Koreys tili' },
						{ key: 'TURKISH', label: '🇹🇷 Turk tili' },
						{ key: 'UZBEK', label: '🇺🇿 Ona tili' },
						{ key: 'MATH', label: '🧮 Matematika' },
						{ key: 'PHYSICS', label: '⚛️ Fizika' },
						{ key: 'CHEMISTRY', label: '🧪 Kimyo' },
						{ key: 'BIOLOGY', label: '🧬 Biologiya' },
						{ key: 'HISTORY', label: '📜 Tarix' },
						{ key: 'LAW', label: '⚖️ Huquq' },
						{ key: 'OTHER', label: '➕ Boshqa' },
						{ key: 'NONE', label: "❌ Sertifikatim yo'q" }
					]

					const languageKeys = [
						'ENGLISH',
						'ARABIC',
						'RUSSIAN',
						'GERMAN',
						'KOREAN',
						'TURKISH',
						'UZBEK'
					]

					// Bitta sertifikat tanlash
					const selected = await askSingleSelect(
						conversation,
						ctx,
						'📜 *Qaysi til/fandan sertifikatingiz bor?*',
						certOptions,
						{ back: true, cancel: true }
					)

					// Agar "Sertifikatim yo'q" tanlansa
					if (selected === 'NONE') {
						ctx.session.temp.answers.certificates = []
						ctx.session.temp.answers.certificates_level = {}
						ctx.session.history.push(step)
						step = nextStep(step)
						break
					}

					const selectedArray = [selected]
					const levelsMap: Record<string, string> = {}

					// Agar til sertifikati bo'lsa, darajasini so'rash
					if (languageKeys.includes(selected)) {
						const certLabel = certOptions.find(opt => opt.key === selected)?.label || selected

						const levelButtons: InlineBtn[] = [
							{ text: '🇪🇺 A1', data: 'LVL|A1' },
							{ text: '🇪🇺 A2', data: 'LVL|A2' },
							{ text: '🇬🇧 B1', data: 'LVL|B1' },
							{ text: '🇬🇧 B2', data: 'LVL|B2' },
							{ text: '🇬🇧 C1', data: 'LVL|C1' },
							{ text: '🇬🇧 C2', data: 'LVL|C2' },
							{ text: '🎯 IELTS', data: 'LVL|IELTS' },
							{ text: '🎯 TOEFL', data: 'LVL|TOEFL' },
							{ text: '✍️ Boshqa', data: 'LVL|OTHER' }
						]

						const picked = await askInline(
							conversation,
							ctx,
							`🏷️ *${certLabel}* darajangiz?`,
							levelButtons,
							{ back: true, cancel: true, columns: 3 }
						)

						if (picked === 'LVL|OTHER') {
							levelsMap[selected] = await askText(
								conversation,
								ctx,
								`✍️ *${certLabel}* darajani yozing (masalan: B2 / IELTS 6.5):`,
								{ back: true, cancel: true, oneTime: true }
							)
						} else {
							levelsMap[selected] = picked.replace('LVL|', '')
						}
					} else {
						// Fan sertifikatlari uchun
						levelsMap[selected] = 'SERTIFIKAT'
					}

					// Vaqtinchalik saqlash
					ctx.session.temp.answers.certificates = selectedArray
					ctx.session.temp.answers.certificates_level = levelsMap

					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EXP_COMPANY: {
					const hasExp = ctx.session.temp.hasExp

					if (hasExp == null) {
						const a = await askInline(
							conversation,
							ctx,
							'💼 *Oldin biror joyda ishlaganmisiz?*',
							[
								{ text: '✅ Ha', data: 'EXP|YES' },
								{ text: '❌ Yoʻq', data: 'EXP|NO' }
							],
							{ back: true, cancel: true, columns: 2 }
						)
						ctx.session.temp.hasExp = a === 'EXP|YES'
						ctx.session.temp.answers.exp_has = ctx.session.temp.hasExp ? 'YES' : 'NO'
						ctx.session.history.push(step)
						break
					}

					if (!hasExp) {
						ctx.session.history.push(step)
						step = StepKey.EXP_CAN_WORK_HOW_LONG
						break
					}

					const company = await askText(
						conversation,
						ctx,
						"💼 *Oldin qayerda ishlagansiz?*\n\nMasalan: *Klinika / Call-center / Do'kon*",
						{ back: true, cancel: true, oneTime: true }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.exp_company = Validators.sanitizeText(company)
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EXP_DURATION: {
					const data = await askInline(
						conversation,
						ctx,
						'⏳ *Qancha muddat ishlagansiz?*',
						[
							{ text: '0–6 oy', data: 'DUR|0_6' },
							{ text: '6–12 oy', data: 'DUR|6_12' },
							{ text: '1–2 yil', data: 'DUR|1_2Y' },
							{ text: '2+ yil', data: 'DUR|2P' },
							{ text: 'Qo‘lda yozaman', data: 'DUR|CUSTOM' }
						],
						{ back: true, cancel: true, columns: 1 }
					)

					let value = data
					if (data === 'DUR|CUSTOM') {
						value = Validators.sanitizeText(
							await askText(conversation, ctx, '⏳ *Muddatni yozing:* (masalan: 8 oy)', {
								back: true,
								cancel: true,
								oneTime: true
							})
						)
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.exp_duration = value
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EXP_POSITION: {
					const pos = await askText(conversation, ctx, '👔 *Qaysi lavozimda ishlagansiz?*', {
						back: true,
						cancel: true,
						oneTime: true
					})
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.exp_position = Validators.sanitizeText(pos)
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EXP_LEAVE_REASON: {
					const reason = await askText(conversation, ctx, '❓ *Ishdan ketish sababi?*', {
						back: true,
						cancel: true,
						skip: true,
						oneTime: true
					})
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.exp_leave_reason = Validators.sanitizeText(reason)
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.EXP_CAN_WORK_HOW_LONG: {
					const buttons: InlineBtn[] = [
						{ text: '🕐 3 oygacha', data: 'DUR|UPTO_3M' },
						{ text: '📅 6 oygacha', data: 'DUR|UPTO_6M' },
						{ text: '📆 1 yilgacha', data: 'DUR|UPTO_1Y' },
						{ text: '⏳ 1-2 yil', data: 'DUR|1_2Y' },
						{ text: '🔮 2+ yil', data: 'DUR|2P_Y' },
						{ text: '❓ Aniq emas', data: 'DUR|UNKNOWN' },
						{ text: '✍️ Boshqa', data: 'DUR|CUSTOM' }
					]

					const selected = await askInline(
						conversation,
						ctx,
						'🕒 *Biz bilan qancha muddat ishlay olasiz?*',
						buttons,
						{ back: true, cancel: true, columns: 2 }
					)

					let howLong = ''

					if (selected === 'DUR|UPTO_3M') {
						howLong = '3 oygacha'
					} else if (selected === 'DUR|UPTO_6M') {
						howLong = '6 oygacha'
					} else if (selected === 'DUR|UPTO_1Y') {
						howLong = '1 yilgacha'
					} else if (selected === 'DUR|1_2Y') {
						howLong = '1-2 yil'
					} else if (selected === 'DUR|2P_Y') {
						howLong = '2+ yil'
					} else if (selected === 'DUR|UNKNOWN') {
						howLong = 'Aniq emas'
					} else if (selected === 'DUR|CUSTOM') {
						howLong = await askText(
							conversation,
							ctx,
							'✍️ *Qancha muddat ishlay olasiz? Yozing:*\n\nMasalan: *8 oy*, *2 yil*',
							{ back: true, cancel: true, oneTime: true }
						)
					} else {
						howLong = selected.replace('DUR|', '')
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.exp_can_work_how_long = howLong
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.SKILLS_COMPUTER: {
					const selected = await askMultiSelect(
						conversation,
						ctx,
						'💻 *Kompyuterda ishlay olasizmi? (Word/Excel/Telegram/CRM)*\n\nBir nechta tanlang:',
						[
							{ key: 'WORD', label: '📝 Word' },
							{ key: 'EXCEL', label: '📊 Excel' },
							{ key: 'TELEGRAM', label: '📱 Telegram' },
							{ key: 'CRM', label: '📋 CRM' },
							{ key: 'GOOGLE_SHEETS', label: '📈 Google Sheets' }
						],
						new Set<string>(),
						{ back: true, cancel: true }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.computer_skills = Array.from(selected)
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FIT_COMMUNICATION: {
					const buttons: InlineBtn[] = [
						{ text: '🌟 Aʼlo', data: 'COMM|EXCELLENT' },
						{ text: '👍 Yaxshi', data: 'COMM|GOOD' },
						{ text: '👌 Oʻrtacha', data: 'COMM|AVERAGE' },
						{ text: '🤝 Qoniqarli', data: 'COMM|SATISFACTORY' }
					]

					const comm = await askInline(
						conversation,
						ctx,
						'🗣️ *Muloqot qobiliyatingiz qanday?*',
						buttons,
						{ back: true, cancel: true, columns: 2 }
					)

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.communication_skill = comm
					ctx.session.temp.communicationSkill = comm
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FIT_CALLS: {
					const calls = await askInline(
						conversation,
						ctx,
						'📞 *Telefon qo‘ng‘iroqlariga javob bera olasizmi?*',
						[
							{ text: '✅ Ha', data: 'CALLS|YES' },
							{ text: '❌ Yo‘q', data: 'CALLS|NO' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.can_answer_calls = calls
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FIT_CLIENT_EXP: {
					const exp = await askInline(
						conversation,
						ctx,
						'🤝 *Mijozlar bilan ishlash tajribangiz bormi?*',
						[
							{ text: '✅ Ha', data: 'CLIENT|YES' },
							{ text: '❌ Yo‘q', data: 'CLIENT|NO' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.client_experience = exp
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FIT_DRESS: {
					const dress = await askInline(
						conversation,
						ctx,
						'👔 *Kiyinish madaniyatiga rioya qilasizmi?*',
						[
							{ text: '✅ Ha', data: 'DRESS|YES' },
							{ text: '❌ Yo‘q', data: 'DRESS|NO' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.dress_code = dress
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FIT_STRESS: {
					const stress = await askInline(
						conversation,
						ctx,
						'💪 *Stressga chidamliligingiz qanday?*',
						[
							{ text: 'Yuqori', data: 'STRESS|HIGH' },
							{ text: 'O‘rtacha', data: 'STRESS|MID' },
							{ text: 'Past', data: 'STRESS|LOW' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.stress_tolerance = stress
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.WORK_SHIFT: {
					const shift = await askInline(
						conversation,
						ctx,
						'⏰ *Qaysi ish vaqtida ishlay olasiz?*',
						[
							{ text: "⚡ To'liq stavka", data: 'SHIFT|FULL' },
							{ text: '🕐 Yarim stavka', data: 'SHIFT|HALF' }
						],
						{ back: true, cancel: true, columns: 1 }
					)

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.work_shift = shift
					ctx.session.temp.workShift = shift
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.WORK_SALARY: {
					const shift = ctx.session.temp.workShift

					let question = '💰 *Oylik kutilmangiz qancha?*'
					let placeholder = 'Masalan: *3 000 000 so‘m*'

					if (shift === 'SHIFT|HALF') {
						question = '💰 *Yarim stavka uchun oylik kutilmangiz qancha?*'
						placeholder = 'Masalan: *1 500 000 so‘m*'
					}

					const buttons: InlineBtn[] = [
						{ text: '💰 2-3 million', data: 'SALARY|2_3M' },
						{ text: '💰 3-4 million', data: 'SALARY|3_4M' },
						{ text: '💰 4-5 million', data: 'SALARY|4_5M' },
						{ text: '💰 5-6 million', data: 'SALARY|5_6M' },
						{ text: '💰 6-8 million', data: 'SALARY|6_8M' },
						{ text: '💰 8-10 million', data: 'SALARY|8_10M' },
						{ text: '💰 10+ million', data: 'SALARY|10P_M' },
						{ text: "✍️ Qo'lda kiritish", data: 'SALARY|CUSTOM' }
					]

					const selected = await askInline(
						conversation,
						ctx,
						`${question}\n\n*Yoki quyidagilardan tanlang:*`,
						buttons,
						{ back: true, cancel: true, columns: 2 }
					)

					let salary = ''

					if (selected === 'SALARY|2_3M') {
						salary = '2-3 million soʻm'
					} else if (selected === 'SALARY|3_4M') {
						salary = '3-4 million soʻm'
					} else if (selected === 'SALARY|4_5M') {
						salary = '4-5 million soʻm'
					} else if (selected === 'SALARY|5_6M') {
						salary = '5-6 million soʻm'
					} else if (selected === 'SALARY|6_8M') {
						salary = '6-8 million soʻm'
					} else if (selected === 'SALARY|8_10M') {
						salary = '8-10 million soʻm'
					} else if (selected === 'SALARY|10P_M') {
						salary = '10+ million soʻm'
					} else if (selected === 'SALARY|CUSTOM') {
						salary = await askText(
							conversation,
							ctx,
							`✍️ *Oylik kutilmangizni yozing:*\n\n${placeholder}`,
							{ back: true, cancel: true, oneTime: true }
						)
					} else {
						salary = selected.replace('SALARY|', '')
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.expected_salary = salary
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.WORK_START_DATE: {
					const shift = ctx.session.temp.workShift

					let question = '🚀 *Qachondan ish boshlay olasiz?*'
					let placeholder = 'Masalan: *01.03.2026* yoki *bugun/ertaga*'

					if (shift === 'SHIFT|HALF') {
						question = '🚀 *Yarim stavkada qachondan ish boshlay olasiz?*'
					}

					const buttons: InlineBtn[] = [
						{ text: '📅 Bugun', data: 'START|TODAY' },
						{ text: '⏳ Ertaga', data: 'START|TOMORROW' },
						{ text: '📆 1 haftadan', data: 'START|1WEEK' },
						{ text: '📆 2 haftadan', data: 'START|2WEEKS' },
						{ text: '📆 1 oydan', data: 'START|1MONTH' },
						{ text: "✍️ Qo'lda kiritish", data: 'START|CUSTOM' }
					]

					const selected = await askInline(
						conversation,
						ctx,
						`${question}\n\n*Yoki quyidagilardan tanlang:*`,
						buttons,
						{ back: true, cancel: true, columns: 2 }
					)

					let startDate = ''

					if (selected === 'START|TODAY') {
						startDate = 'Bugun'
					} else if (selected === 'START|TOMORROW') {
						startDate = 'Ertaga'
					} else if (selected === 'START|1WEEK') {
						startDate = '1 haftadan keyin'
					} else if (selected === 'START|2WEEKS') {
						startDate = '2 haftadan keyin'
					} else if (selected === 'START|1MONTH') {
						startDate = '1 oydan keyin'
					} else if (selected === 'START|CUSTOM') {
						startDate = await askText(
							conversation,
							ctx,
							`✍️ *Ish boshlash sanasini yozing:*\n\n${placeholder}`,
							{ back: true, cancel: true, oneTime: true }
						)
					} else {
						startDate = selected.replace('START|', '')
					}

					// VAQTINCHALIK SAQLASH
					ctx.session.temp.answers.start_date = startDate
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FILE_PHOTO_HALF_BODY: {
					const rules = {
						minWidth: PhotoRules.MIN_WIDTH,
						minHeight: PhotoRules.MIN_HEIGHT,
						minRatio: PhotoRules.MIN_RATIO,
						maxRatio: PhotoRules.MAX_RATIO
					}
					await PhotoStep.handle(conversation, ctx, rules, applicationId)
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FILE_PASSPORT_OPTIONAL: {
					const want = await askInline(
						conversation,
						ctx,
						'🪪 *Pasport nusxasini yubora olasizmi?* (ixtiyoriy)',
						[
							{ text: '✅ Ha, yuboraman', data: 'PASS|YES' },
							{ text: '⏭ Hozir yo‘q', data: 'PASS|NO' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					if (want === 'PASS|YES') {
						const file = await askFile(
							conversation,
							ctx,
							'📎 *Pasport nusxasini yuboring* (rasm yoki fayl):',
							true
						)
						if (file) {
							await applicationService.saveFile(
								applicationId,
								FileType.PASSPORT,
								file.telegramFileId
							)
						}
					}
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.FILE_RECOMMENDATION: {
					const want = await askInline(
						conversation,
						ctx,
						'📄 *Tavsiyanoma bormi?* (ixtiyoriy)',
						[
							{ text: '✅ Ha', data: 'REC|YES' },
							{ text: '⏭ Yo‘q', data: 'REC|NO' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					if (want === 'REC|YES') {
						const file = await askFile(
							conversation,
							ctx,
							'📎 *Tavsiyanomani yuboring* (rasm yoki fayl):',
							true
						)
						if (file) {
							await applicationService.saveFile(
								applicationId,
								FileType.RECOMMENDATION,
								file.telegramFileId
							)
						}
					}
					ctx.session.history.push(step)
					step = nextStep(step)
					break
				}

				case StepKey.REVIEW_CONFIRM: {
					// Vaqtinchalik ma'lumotlardan summary yaratish
					const summary = buildSummaryFromTemp(ctx.session.temp.answers)

					await replaceBotMessage(
						ctx,
						'📄 *Anketa tayyor!*\n\n' +
							"Quyidagi ma'lumotlarni tekshirib chiqing:\n\n" +
							summary +
							'\n\nTasdiqlaysizmi yoki tahrir qilasizmi?',
						{ parse_mode: 'Markdown', reply_markup: keyboards.confirmSubmit() }
					)

					const u = await conversation.wait()

					if (!u.callbackQuery || !u.callbackQuery.data) {
						await replaceBotMessage(ctx, 'Iltimos, tugmalardan foydalaning 👇')
						break
					}

					const data = u.callbackQuery.data

					try {
						await u.answerCallbackQuery()
					} catch (err) {
						logger.warn({ err, userId: ctx.from?.id }, 'Failed to answer callback query in review')
					}

					if (data === 'NAV|CANCEL') throw navError('CANCEL')

					if (data === 'CONFIRM|EDIT') {
						step = popOrFirst(ctx.session.history, StepKey.PERSON_FULL_NAME)
						break
					}

					if (data === 'CONFIRM|SUBMIT') {
						// BARCHA MA'LUMOTLARNI BAZAGA SAQLASH
						const answers = ctx.session.temp.answers

						for (const [key, value] of Object.entries(answers)) {
							if (value !== undefined && value !== null) {
								await applicationService.saveAnswer(
									applicationId,
									key,
									typeof value === 'object' ? JSON.stringify(value) : String(value),
									getFieldType(key)
								)
							}
						}

						// Vakansiyani saqlash
						if (ctx.session.temp.vacancyId) {
							await applicationService.setVacancy(applicationId, ctx.session.temp.vacancyId)
						}

						// Arizani topshirish
						await applicationService.submitApplication(applicationId)

						// Admin panelga yuborish
						const adminSummary = await buildAdminSummary(applicationId)
						const adminKb = new InlineKeyboard()
							.text('✅ Qabul qilish', `ADMIN|APPROVE|${applicationId}`)
							.text('❌ Bekor qilish', `ADMIN|REJECT|${applicationId}`)

						await ctx.api.sendMessage(
							Number(process.env.ADMIN_CHAT_ID),
							`🆕 *Yangi ariza #${applicationId.slice(0, 8)}*\n\n${adminSummary}`,
							{ parse_mode: 'Markdown', reply_markup: adminKb }
						)

						await replaceBotMessage(
							ctx,
							'✅ *Anketa topshirildi!*\n\n' +
								"Sizning anketangiz qabul qilindi. Tez orada adminlar bog'lanadi.",
							{ parse_mode: 'Markdown' }
						)

						step = StepKey.SUBMITTED
						break
					}
					break
				}

				default:
					step = StepKey.SUBMITTED
			}

			ctx.session.currentStep = step
		} catch (err) {
			if (isNavSignal(err)) {
				const signal = err.message as NavSignal

				if (signal === 'CANCEL') {
					await applicationService.cancelApplication(applicationId)
					ctx.session.applicationId = undefined
					ctx.session.currentStep = StepKey.PERSON_FULL_NAME
					ctx.session.history = []
					ctx.session.temp = {} as SessionData['temp']
					ctx.session.lastBotMessageId = undefined
					await replaceBotMessage(
						ctx,
						'❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start bosing.',
						{ parse_mode: 'Markdown' }
					)
					return
				}

				if (signal === 'BACK') {
					step = popOrFirst(ctx.session.history, StepKey.PERSON_FULL_NAME)
					ctx.session.currentStep = step
					continue
				}

				if (signal === 'SKIP') {
					ctx.session.history.push(step)
					step = nextStep(step)
					ctx.session.currentStep = step
					continue
				}
			}

			logger.error({ err, applicationId, step, userId: ctx.from?.id }, 'applicationFlow failed')
			await replaceBotMessage(
				ctx,
				"Xatolik yuz berdi. /start bilan qayta urinib ko'ring (anketa saqlanib qolgan bo'lishi mumkin)."
			)
			return
		}
	}
}

// Yordamchi funksiya - temp.answers dan summary yaratish
function buildSummaryFromTemp(answers: Record<string, any>): string {
	let summary = ''

	if (answers.full_name) summary += `👤 Ism: ${answers.full_name}\n`
	if (answers.birth_date)
		summary += `📅 Tug'ilgan sana: ${answers.birth_date}${
			answers.birth_age ? ` (${answers.birth_age} yosh)` : ''
		}\n`
	if (answers.address) summary += `📍 Manzil: ${answers.address}\n`
	if (answers.phone) summary += `📞 Telefon: ${answers.phone}\n`
	if (answers.marital_status)
		summary += `💍 Oilaviy holat: ${answers.marital_status.replace('MAR|', '')}\n`
	if (answers.education_type)
		summary += `🎓 Ta'lim: ${answers.education_type.replace('EDU|', '')}\n`
	if (answers.speciality) summary += `📚 Mutaxassislik: ${answers.speciality}\n`
	if (answers.certificates && answers.certificates.length > 0) {
		summary += `📜 Sertifikatlar: ${answers.certificates.join(', ')}\n`
	}
	if (answers.exp_has) summary += `💼 Tajriba: ${answers.exp_has === 'YES' ? 'Bor' : "Yo'q"}\n`
	if (answers.exp_company) summary += `🏢 Ish joyi: ${answers.exp_company}\n`
	if (answers.exp_duration) summary += `⏳ Ish muddati: ${answers.exp_duration}\n`
	if (answers.exp_position) summary += `👔 Lavozim: ${answers.exp_position}\n`
	if (answers.exp_can_work_how_long)
		summary += `🕒 Biz bilan ishlash: ${answers.exp_can_work_how_long}\n`
	if (answers.computer_skills) summary += `💻 Kompyuter: ${answers.computer_skills.join(', ')}\n`
	if (answers.communication_skill) summary += `🗣️ Muloqot: ${answers.communication_skill}\n`
	if (answers.expected_salary) summary += `💰 Oylik: ${answers.expected_salary}\n`
	if (answers.start_date) summary += `🚀 Boshlash: ${answers.start_date}\n`

	return summary
}