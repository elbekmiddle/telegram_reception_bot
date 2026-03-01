import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'
import { AnswerFieldType, FileType } from '@prisma/client'

import type { BotContext } from '../bot'
import { StepKey, PhotoRules } from '../../config/constants'
import { applicationService } from '../../services/application.service'
import { adminService } from '../../services/admin.service'
import { vacancyService } from '../../services/vacancy.service'
import { PhotoStep } from './photo.step'
import { Validators } from '../../utils/validators'
import { buildSummary } from '../../utils/format'
import { keyboards } from '../../utils/keyboards'
import { logger } from '../../utils/logger'

type NavSignal = 'BACK' | 'CANCEL' | 'SKIP'
const navError = (sig: NavSignal) => new Error(sig)

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

	// Asosiy tugmalar
	for (let i = 0; i < buttons.length; i++) {
		kb.text(buttons[i].text, buttons[i].data)
		if ((i + 1) % cols === 0) kb.row()
	}

	// Agar tugmalar soni cols ga karrali bo'lmasa, qator tugatish
	if (buttons.length % cols !== 0) kb.row()

	// Navigatsiya tugmalari (alohida qatorlarda)
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

async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	buttons: InlineBtn[],
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean; columns?: number }
): Promise<string> {
	await replaceBotMessage(ctx, question, { parse_mode: 'Markdown', reply_markup: buildInlineKb(buttons, opts) })

	while (true) {
		const upd = await conversation.wait()

		if (!upd.callbackQuery) {
			await replaceBotMessage(ctx, 'Iltimos, quyidagi tugmalardan birini tanlang 👇')
			continue
		}

		await upd.answerCallbackQuery()
		const data = upd.callbackQuery.data
		if (!data) continue

		if (data === 'NAV|BACK') throw navError('BACK')
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === 'NAV|SKIP') throw navError('SKIP')
		return data
	}
}

// async function askText(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext,
// 	question: string,
// 	opts?: { back?: boolean; cancel?: boolean; skip?: boolean }
// ): Promise<string> {
// 	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined
// 	await replaceBotMessage(ctx, question, navKb ? { parse_mode: 'Markdown', reply_markup: navKb } : { parse_mode: 'Markdown' })

// 	while (true) {
// 		const upd = await conversation.wait()
// 		if (upd.callbackQuery) {
// 			await upd.answerCallbackQuery()
// 			const data = upd.callbackQuery.data
// 			if (!data) continue
// 			if (data === 'NAV|BACK') throw navError('BACK')
// 			if (data === 'NAV|CANCEL') throw navError('CANCEL')
// 			if (data === 'NAV|SKIP') throw navError('SKIP')
// 			continue
// 		}

// 		// if (text) return text
// 		const text = upd.message?.text?.trim()

// 		if (text) {
// 			if (text === '/start' || text === '/admin' || text === '/cancel') {
// 				// conversation ichida command ishlamaydi, shuning uchun anketa bekor qilamiz
// 				throw navError('CANCEL')
// 			}
// 			return text
// 		}

// 		await replaceBotMessage(ctx, 'Iltimos, matn yuboring ✍️')
// 	}
// }
// application.flow.ts dagi askText funksiyasini to'liq almashtiring:

async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string,
	opts?: { back?: boolean; cancel?: boolean; skip?: boolean }
): Promise<string> {
	console.log('📝 askText called with question:', question)

	const navKb = opts?.back || opts?.cancel || opts?.skip ? buildInlineKb([], opts) : undefined

	// Agar oldingi xabar bir xil bo'lsa, qayta yubormaslik
	const lastMsgId = ctx.session.lastBotMessageId
	if (lastMsgId) {
		try {
			await ctx.api.deleteMessage(ctx.chat!.id, lastMsgId)
		} catch (e) {
			// ignore
		}
	}
	
	const sent = await ctx.reply(question, {
		parse_mode: 'Markdown',
		...(navKb && { reply_markup: navKb })
	})
	ctx.session.lastBotMessageId = sent.message_id

	while (true) {
		console.log('⏳ Waiting for user input...')
		const upd = await conversation.wait()
		console.log('📨 Received update type:', upd.updateType)

		// Callback query (navigatsiya tugmalari)
		if (upd.callbackQuery) {
			console.log('🔘 Callback query received:', upd.callbackQuery.data)
			await upd.answerCallbackQuery()
			const data = upd.callbackQuery.data
			if (!data) continue

			if (data === 'NAV|BACK') throw navError('BACK')
			if (data === 'NAV|CANCEL') throw navError('CANCEL')
			if (data === 'NAV|SKIP') throw navError('SKIP')

			// Boshqa callback'lar (VAC, MAR, etc) - ularni handle qilish uchun
			// bu funksiyadan chiqib, asosiy flow'ga qaytish kerak
			console.log('ℹ️ Other callback received, returning:', data)
			return data
		}

		// Message text
		if (upd.message && upd.message.text) {
			const text = upd.message.text.trim()
			console.log('📄 Message text:', text)

			// Komandalarni tekshirish
			if (text === '/start' || text === '/admin' || text === '/cancel') {
				console.log('🚫 Command received, cancelling:', text)
				throw navError('CANCEL')
			}

			console.log('✅ Valid text received:', text)
			return text
		}

		console.log('❌ No valid text received, asking again')
		await ctx.reply('Iltimos, matn yuboring ✍️')
	}
}
type MultiOpt = { key: string; label: string }

function buildMultiKb(prefix: string, opts: MultiOpt[], selected: Set<string>, nav?: { back?: boolean; cancel?: boolean }) {
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

			// Edit keyboard (fallback to replace)
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

export async function applicationFlow(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return
	ctx.session.temp ??= {}

	// Session in-memory (Redis removed)
	if (!ctx.session.applicationId) {
		const app = await applicationService.createApplication(telegramId)
		ctx.session.applicationId = app.id
		ctx.session.currentStep = StepKey.PERSON_FULL_NAME
		ctx.session.history = []
		ctx.session.temp = {}
		ctx.session.createdAt = Date.now()
		ctx.session.lastActivity = Date.now()

		await replaceBotMessage(
			ctx,
			[
				"✨ *Assalomu alaykum! Anketa to'ldirishni boshlaymiz*",
				'',
				"Savollarga javob berish orqali ishga qabul jarayonini boshlaysiz.",
				"Har bir savolga to'g'ri va to'liq javob bering.",
				'',
				"Boshlash uchun birinchi savolga javob bering 👇"
			].join('\n'),
			{ parse_mode: 'Markdown' }
		)
	}

	const applicationId = ctx.session.applicationId
	if (!applicationId) {
		await replaceBotMessage(ctx, "Xatolik. Iltimos, /start bilan qayta boshlang.")
		return
	}

	// Vacancy tanlash (bir marta, agar bazada vakansiyalar bo'lsa)
	if (!(ctx.session.temp as any).vacancyPicked) {
		const vacancies = await vacancyService.listActive()
		if (vacancies.length > 0) {
			const buttons = vacancies
				.slice(0, 12)
				.map(v => ({ text: v.title, data: `VAC|${v.id}` }))
			const picked = await askInline(
				conversation,
				ctx,
				'📌 *Qaysi vakansiyaga topshirasiz?*',
				buttons,
				{ cancel: true, columns: 1 }
			)
			if (picked.startsWith('VAC|')) {
				const vacancyId = picked.replace('VAC|', '')
				await applicationService.setVacancy(applicationId, vacancyId)
				;(ctx.session.temp as any).vacancyId = vacancyId
			}
		}
		;(ctx.session.temp as any).vacancyPicked = true
	}

	let step: StepKey = ctx.session.currentStep
	// temp flags
	ctx.session.temp ??= {}

	while (step !== StepKey.SUBMITTED) {
		try {
			ctx.session.lastActivity = Date.now()

			switch (step) {
				case StepKey.PERSON_FULL_NAME: {
					const name = await askText(
						conversation,
						ctx,
						'👤 *Ism, familiyangizni kiriting:*\n\nMasalan: *Alisher Karimov*',
						{ cancel: true }
					)

					// Agar callback qaytgan bo'lsa (VAC|..., MAR|..., etc)
					if (name.includes('|')) {
						if (name.startsWith('VAC|')) {
							// Vakansiya tanlash tugmasi bosilgan - buni ignore qilamiz
							// chunki biz allaqachon vakansiya tanlaganmiz
							console.log('⚠️ Vacancy callback received in name step, ignoring:', name)
							continue
						}
						// Boshqa callback'lar uchun
						console.log('⚠️ Other callback received in name step:', name)
						continue
					}

					const clean = Validators.sanitizeText(name)
					if (!Validators.validateName(clean)) {
						await replaceBotMessage(ctx, "😕 Ism-familiya noto'g'ri. Qaytadan kiriting.")
						continue
					}

					await applicationService.saveAnswer(
						applicationId,
						'full_name',
						clean,
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}
				case StepKey.PERSON_BIRTHDATE: {
					const date = await askText(
						conversation,
						ctx,
						"📅 *Tug'ilgan sanangiz:*\n\nFormat: *DD.MM.YYYY* (masalan: *24.03.2004*)",
						{ back: true, cancel: true }
					)

					// Agar callback qaytgan bo'lsa
					if (date.includes('|')) {
						if (date.startsWith('VAC|')) {
							console.log('⚠️ Vacancy callback received in birthdate step, ignoring:', date)
							continue
						}
						console.log('⚠️ Other callback received in birthdate step:', date)
						continue
					}

					const clean = Validators.normalizeBirthDate(date)
					const v = Validators.validateBirthDate(clean)

					if (!v.isValid) {
						await replaceBotMessage(ctx, "😕 Sana noto'g'ri formatda. Masalan: *24.03.2004*", {
							parse_mode: 'Markdown'
						})
						continue
					}

					await applicationService.saveAnswer(
						applicationId,
						'birth_date',
						clean,
						AnswerFieldType.DATE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.PERSON_ADDRESS: {
					const addr = await askText(
						conversation,
						ctx,
						'📍 *Yashash manzilingiz (shahar/tuman):*\n\nMasalan: *Toshkent, Chilonzor*',
						{ back: true, cancel: true }
					)
					const clean = Validators.sanitizeText(addr)
					await applicationService.saveAnswer(applicationId, 'address', clean, AnswerFieldType.TEXT)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.PERSON_PHONE: {
					const phone = await askText(
						conversation,
						ctx,
						'📞 *Telefon raqamingiz:*\n\nMasalan: *+998901234567*',
						{ back: true, cancel: true }
					)
					const clean = Validators.sanitizeText(phone)
					if (!Validators.validatePhone(clean)) {
						await replaceBotMessage(ctx, "😕 Telefon raqam noto'g'ri. Masalan: *+998901234567*", {
							parse_mode: 'Markdown'
						})
						break
					}
					await applicationService.saveAnswer(applicationId, 'phone', clean, AnswerFieldType.PHONE)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'marital_status',
						data,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'education_type',
						data,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EDU_SPECIALITY: {
					const spec = await askText(conversation, ctx, '📚 *Mutaxassisligingiz (yo‘nalish):*', {
						back: true,
						cancel: true
					})
					await applicationService.saveAnswer(
						applicationId,
						'speciality',
						Validators.sanitizeText(spec),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EDU_CERTS: {
					const certOptions: MultiOpt[] = [
						{ key: 'ENGLISH', label: '🇬🇧 Ingliz' },
						{ key: 'ARABIC', label: '🇸🇦 Arab' },
						{ key: 'RUSSIAN', label: '🇷🇺 Rus' },
						{ key: 'GERMAN', label: '🇩🇪 Nemis' },
						{ key: 'KOREAN', label: '🇰🇷 Koreys' },
						{ key: 'TURKISH', label: '🇹🇷 Turk' },
						{ key: 'UZBEK', label: '🟩 Ona tili' },
						{ key: 'MATH', label: '➗ Matematika' },
						{ key: 'PHYSICS', label: '🧲 Fizika' },
						{ key: 'CHEMISTRY', label: '🧪 Kimyo' },
						{ key: 'BIOLOGY', label: '🧬 Biologiya' },
						{ key: 'HISTORY', label: '📜 Tarix' },
						{ key: 'LAW', label: '⚖️ Huquq' },
						{ key: 'OTHER', label: '➕ Boshqa' }
					]

					const selected = await askMultiSelect(
						conversation,
						ctx,
						'📜 *Qaysi til/fandan sertifikatingiz bor? (bir nechta tanlang)*',
						certOptions,
						new Set<string>(),
						{ back: true, cancel: true }
					)

					// Har bir tanlangan sertifikat uchun darajasini so'raymiz.
					// Til certlari uchun: A1-A2-B1-B2-C1-C2 / IELTS / TOEFL / Boshqa
					const levelsMap: Record<string, string> = {}
					const levelButtons: InlineBtn[] = [
						{ text: 'A1', data: 'LVL|A1' },
						{ text: 'A2', data: 'LVL|A2' },
						{ text: 'B1', data: 'LVL|B1' },
						{ text: 'B2', data: 'LVL|B2' },
						{ text: 'C1', data: 'LVL|C1' },
						{ text: 'C2', data: 'LVL|C2' },
						{ text: 'IELTS', data: 'LVL|IELTS' },
						{ text: 'TOEFL', data: 'LVL|TOEFL' },
						{ text: 'Boshqa', data: 'LVL|OTHER' }
					]

					const needLevel = (k: string) =>
						['ENGLISH', 'ARABIC', 'RUSSIAN', 'GERMAN', 'KOREAN', 'TURKISH', 'UZBEK'].includes(k)

					for (const key of selected) {
						if (!needLevel(key)) continue
						const picked = await askInline(
							conversation,
							ctx,
							`🏷️ *${key}* darajangiz?`,
							levelButtons,
							{ back: true, cancel: true, columns: 3, skip: true }
						)
						if (picked === 'LVL|OTHER') {
							levelsMap[key] = Validators.sanitizeText(
								await askText(
									conversation,
									ctx,
									`✍️ *${key}* darajani yozing (masalan: B2 / IELTS 6.5):`,
									{
										back: true,
										cancel: true
									}
								)
							)
						} else {
							levelsMap[key] = picked.replace('LVL|', '')
						}
					}

					await applicationService.saveAnswer(
						applicationId,
						'certificates',
						JSON.stringify([...selected]),
						AnswerFieldType.MULTI_CHOICE
					)
					await applicationService.saveAnswer(
						applicationId,
						'certificates_level',
						Validators.sanitizeText(JSON.stringify(levelsMap)),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EXP_COMPANY: {
					// Oldin ishlagan/ishlamagan flow
					const hasExp = (ctx.session.temp as any).hasExp as boolean | undefined
					if (hasExp == null) {
						const a = await askInline(
							conversation,
							ctx,
							'💼 *Oldin biror joyda ishlaganmisiz?*',
							[
								{ text: '✅ Ha', data: 'EXP|YES' },
								{ text: "❌ Yo'q", data: 'EXP|NO' }
							],
							{ back: true, cancel: true, columns: 2 }
						)
						;(ctx.session.temp as any).hasExp = a === 'EXP|YES'
						await applicationService.saveAnswer(
							applicationId,
							'exp_has',
							(ctx.session.temp as any).hasExp ? 'YES' : 'NO',
							AnswerFieldType.SINGLE_CHOICE
						)
						// shu stepni qayta ishlatamiz: keyingi iteratsiyada company so'raydi yoki skip qiladi
						break
					}

					if (!hasExp) {
						// Tajriba yo'q bo'lsa, tajriba bloklarini o'tkazib yuboramiz
						ctx.session.history.push(step)
						step = StepKey.EXP_CAN_WORK_HOW_LONG
						await applicationService.updateCurrentStep(applicationId, step)
						break
					}

					const company = await askText(
						conversation,
						ctx,
						"💼 *Oldin qayerda ishlagansiz?*\n\nMasalan: *Klinika / Call-center / Do'kon*",
						{ back: true, cancel: true }
					)
					await applicationService.saveAnswer(
						applicationId,
						'exp_company',
						Validators.sanitizeText(company),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
								cancel: true
							})
						)
					}

					await applicationService.saveAnswer(
						applicationId,
						'exp_duration',
						value,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EXP_POSITION: {
					const pos = await askText(conversation, ctx, '👔 *Qaysi lavozimda ishlagansiz?*', {
						back: true,
						cancel: true
					})
					await applicationService.saveAnswer(
						applicationId,
						'exp_position',
						Validators.sanitizeText(pos),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EXP_LEAVE_REASON: {
					const reason = await askText(conversation, ctx, '❓ *Ishdan ketish sababi?*', {
						back: true,
						cancel: true,
						skip: true
					})
					await applicationService.saveAnswer(
						applicationId,
						'exp_leave_reason',
						Validators.sanitizeText(reason),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.EXP_CAN_WORK_HOW_LONG: {
					const howLong = await askText(
						conversation,
						ctx,
						'🕒 *Biz bilan qancha muddat ishlay olasiz?*\n\nMasalan: *1 yil*, *2+ yil*, *aniq emas*',
						{ back: true, cancel: true }
					)
					await applicationService.saveAnswer(
						applicationId,
						'exp_can_work_how_long',
						Validators.sanitizeText(howLong),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'computer_skills',
						JSON.stringify([...selected]),
						AnswerFieldType.MULTI_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.FIT_COMMUNICATION: {
					const comm = await askInline(
						conversation,
						ctx,
						'🗣️ *Muloqot qobiliyatingiz qanday?*',
						[
							{ text: 'A’lo', data: 'COMM|A' },
							{ text: 'Yaxshi', data: 'COMM|B' },
							{ text: 'O‘rtacha', data: 'COMM|C' }
						],
						{ back: true, cancel: true, columns: 1 }
					)
					await applicationService.saveAnswer(
						applicationId,
						'communication_skill',
						comm,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'can_answer_calls',
						calls,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'client_experience',
						exp,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'dress_code',
						dress,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'stress_tolerance',
						stress,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.saveAnswer(
						applicationId,
						'work_shift',
						shift,
						AnswerFieldType.SINGLE_CHOICE
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.WORK_SALARY: {
					const salary = await askText(
						conversation,
						ctx,
						'💰 *Oylik kutilmangiz qancha?*\n\nMasalan: *3 000 000 so‘m*',
						{ back: true, cancel: true }
					)
					await applicationService.saveAnswer(
						applicationId,
						'expected_salary',
						Validators.sanitizeText(salary),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.WORK_START_DATE: {
					const start = await askText(
						conversation,
						ctx,
						'🚀 *Qachondan ish boshlay olasiz?*\n\nMasalan: *01.03.2026* yoki *bugun/ertaga*',
						{ back: true, cancel: true }
					)
					await applicationService.saveAnswer(
						applicationId,
						'start_date',
						Validators.sanitizeText(start),
						AnswerFieldType.TEXT
					)
					ctx.session.history.push(step)
					step = nextStep(step)
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.updateCurrentStep(applicationId, step)
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
					await applicationService.updateCurrentStep(applicationId, step)
					break
				}

				case StepKey.REVIEW_CONFIRM: {
					const summary = await buildSummary(applicationId)
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
					await u.answerCallbackQuery()

					if (u.callbackQuery.data === 'NAV|CANCEL') throw navError('CANCEL')
					if (u.callbackQuery.data === 'CONFIRM|EDIT') {
						step = popOrFirst(ctx.session.history, StepKey.PERSON_FULL_NAME)
						break
					}
					if (u.callbackQuery.data === 'CONFIRM|SUBMIT') {
						await applicationService.submitApplication(applicationId)
						await adminService.sendToAdmin(ctx, applicationId)
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
					ctx.session.temp = {}
					ctx.session.lastBotMessageId = undefined
					await replaceBotMessage(
						ctx,
						"❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start bosing.",
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

			// Unknown error: don't silently die in conversation.
			logger.error({ err, applicationId, step, userId: ctx.from?.id }, 'applicationFlow failed')
			await replaceBotMessage(
				ctx,
				"Xatolik yuz berdi. /start bilan qayta urinib ko'ring (anketa saqlanib qolgan bo'lishi mumkin)."
			)
			return
		}
	}
}