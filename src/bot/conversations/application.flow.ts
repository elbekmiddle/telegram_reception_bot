import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'
import type { FileType, QuestionType } from '@prisma/client'

import type { BotContext } from '../bot'
import { vacancyService } from '../../services/vacancy.service'
import { applicationService } from '../../services/application.service'
import { photoService } from '../../services/photo.service'
import { userService } from '../../services/user.service'
import { logger } from '../../utils/logger'
import {
	askText,
	askPhone,
	askInline,
	askPhoto,
	askMultiSelect,
	replaceBotMessage,
	isNavSignal,
	navError,
	type NavSignal
} from './flow-helpers'
import { directSendPhoto, directSendMessage } from './direct-api'
import { showStartMenu } from '../start.menu'

function escapeMarkdown(text: string): string {
	if (!text) return text
	return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

type EffectiveQuestion = {
	id: string
	question: string
	type: QuestionType
	options?: Array<{ text: string; value: string }>
}

const YES_NO_OPTIONS = [
	{ text: '✅ Ha', value: 'ha' },
	{ text: '❌ Yo‘q', value: 'yoq' }
]

const DEFAULT_RECEPTION_QUESTIONS: EffectiveQuestion[] = [
	{ id: 'full_name', question: 'Ism, familiya', type: 'TEXT' },
	{ id: 'birth_date', question: 'Tug‘ilgan sana: 12.04.2004', type: 'TEXT' },
	{ id: 'address', question: 'Yashash manzili (tuman/shahar)', type: 'TEXT' },
	{ id: 'phone_number', question: 'Telefon raqami', type: 'TEXT' },
	{ id: 'family_status', question: 'Oilaviy holati', type: 'TEXT' },
	{
		id: 'last_education',
		question: 'Oxirgi tugatgan o‘quv yurti (maktab/kollej/oliy ta’lim)',
		type: 'TEXT'
	},
	{ id: 'speciality', question: 'Mutaxassisligi', type: 'TEXT' },
	{
		id: 'certificates',
		question:
			'Qaysi til va fandan sertifikati bor ? (ingliz, arab, rus, nemis, koreys, turk, ona tili, matematika, fizika, kimyo, biologiya, tarix, huquq va darajasi)',
		type: 'TEXT'
	},
	{ id: 'worked_before', question: 'Oldin qayerda ishlagan?', type: 'TEXT' },
	{ id: 'work_duration', question: 'Qancha muddat ishlagan?', type: 'TEXT' },
	{ id: 'position', question: 'Qaysi lavozimda ishlagan?', type: 'TEXT' },
	{ id: 'leave_reason', question: 'Ishdan ketish sababi', type: 'TEXT' },
	{ id: 'can_work_duration', question: 'Biz bilan qancha muddat ishlay oladi?', type: 'TEXT' },
	{
		id: 'computer_skills',
		question: 'Kompyuterda ishlay oladimi? (Word, Excel, Telegram, CRM va boshqalar)',
		type: 'TEXT'
	},
	{ id: 'communication_skill', question: 'Muloqot qobiliyati qanday?', type: 'TEXT' },
	{
		id: 'phone_answering',
		question: 'Telefon qo‘ng‘iroqlariga javob bera oladimi?',
		type: 'SINGLE_SELECT',
		options: YES_NO_OPTIONS
	},
	{
		id: 'client_experience',
		question: 'Mijozlar bilan ishlash tajribasi bormi?',
		type: 'SINGLE_SELECT',
		options: YES_NO_OPTIONS
	},
	{
		id: 'appearance',
		question: 'Tashqi ko‘rinish va kiyinish madaniyatiga rioya qiladimi?',
		type: 'SINGLE_SELECT',
		options: YES_NO_OPTIONS
	},
	{ id: 'stress', question: 'Stressga chidamliligi qanday?', type: 'TEXT' },
	{
		id: 'work_schedule',
		question: 'Qaysi ish vaqtida ishlay oladi? (to‘liq stavka / yarim stavka)',
		type: 'SINGLE_SELECT',
		options: [
			{ text: '🕘 To‘liq stavka', value: 'toliq_stavka' },
			{ text: '🕓 Yarim stavka', value: 'yarim_stavka' }
		]
	},
	{ id: 'salary_expectation', question: 'Oylik kutilmasi qancha?', type: 'TEXT' },
	{ id: 'start_work', question: 'Qachondan ish boshlay oladi?', type: 'TEXT' },
	{ id: 'photo', question: '3x4 rasm yuboring', type: 'TEXT' },
	{
		id: 'recommendation',
		question: 'Tavsiyanoma bormi?',
		type: 'SINGLE_SELECT',
		options: YES_NO_OPTIONS
	}
]

function getFallbackQuestions(): EffectiveQuestion[] {
	return DEFAULT_RECEPTION_QUESTIONS
}

function isValidBirthDate(value: string): boolean {
	const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
	if (!match) return false

	const day = Number(match[1])
	const month = Number(match[2])
	const year = Number(match[3])

	if (month < 1 || month > 12) return false

	const daysInMonth = new Date(year, month, 0).getDate()
	if (day < 1 || day > daysInMonth) return false

	if (year < 1000 || year > 9999) return false

	const date = new Date(year, month - 1, day)
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function getQuestionValidator(
	question: EffectiveQuestion
): ((value: string) => string | null) | undefined {
	if (question.id === 'birth_date' || question.question.includes('Tug‘ilgan sana')) {
		return (value: string) => {
			if (!isValidBirthDate(value)) {
				return '📅 Tug‘ilgan sana noto‘g‘ri formatda.\n\nIltimos, KK.OO.YYYY formatda kiriting.\nMasalan: 12.04.2004'
			}
			return null
		}
	}

	if (question.id === 'phone_number' || question.question === 'Telefon raqami') {
		return (value: string) => {
			const cleaned = value.replace(/[^\d+]/g, '')
			if (!/^\+?\d{9,15}$/.test(cleaned)) {
				return '📞 Telefon raqamni to‘g‘ri kiriting.\nMasalan: +998901234567'
			}
			return null
		}
	}

	return undefined
}

function buildQuestionText(question: string): string {
	const q = question.trim()

	if (q.includes('Tug‘ilgan sana')) {
		return '📅 Tug‘ilgan sanangizni kiriting\n\nMasalan: 12.04.2004'
	}

	if (q === 'Yashash manzili (tuman/shahar)') {
		return '🏠 Yashash manzilingizni kiriting\n\nMasalan: Chilonzor tumani, Toshkent shahri'
	}

	if (q === 'Telefon raqami') {
		return '📞 Telefon raqamingizni kiriting\n\nMasalan: +998901234567'
	}

	if (q === 'Oilaviy holati') {
		return '👨‍👩‍👧‍👦 Oilaviy holatingizni kiriting\n\nMasalan: Uylangan / Turmush qurmagan'
	}

	if (q === 'Oylik kutilmasi qancha?') {
		return '💰 Kutilayotgan oylik maoshingizni kiriting\n\nMasalan: 3 000 000 so‘m'
	}

	if (q === 'Qachondan ish boshlay oladi?') {
		return '⏰ Qachondan ish boshlay olishingizni yozing\n\nMasalan: Ertadan / 1 haftadan keyin'
	}

	return `❓ ${q}`
}

async function handleNavSignal(
	ctx: BotContext,
	applicationId: string,
	signal: NavSignal
): Promise<'CONTINUE' | 'RETURN'> {
	if (signal === 'CANCEL') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await replaceBotMessage(
			ctx,
			'❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start bosing.',
			{ parse_mode: 'Markdown' }
		)
		return 'RETURN'
	}

	if (signal === 'START') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await ctx.conversation.exit()
		await showStartMenu(ctx)
		return 'RETURN'
	}

	if (signal === 'ADMIN') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await ctx.conversation.exit()
		await ctx.conversation.enter('adminFlow')
		return 'RETURN'
	}

	return 'CONTINUE'
}

async function sendDemoPhoto(ctx: BotContext): Promise<void> {
	const chatId = ctx.chat?.id
	if (!chatId) return

	try {
		const demoBuffer = await photoService.getDemoPhotoBuffer()
		if (demoBuffer) {
			try {
				await directSendPhoto(chatId, demoBuffer, {
					caption: '📸 Namunaviy rasm\n\nShunga o‘xshash rasm yuboring.',
					parse_mode: 'Markdown'
				})
				return
			} catch (directErr) {
				logger.warn({ err: directErr }, 'Direct demo photo send failed')
			}
		}

		await directSendMessage(
			chatId,
			'📸 *Rasm talablari:*\n\n• Beldan yuqori qismingiz ko‘rinsin\n• Yuzingiz aniq ko‘rinsin\n• Rasmiyroq kiyim ma’qul',
			{ parse_mode: 'Markdown' }
		)
	} catch (err) {
		logger.warn({ err }, 'Failed to send demo photo')
	}
}

async function pickVacancy(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<string> {
	const perPage = 5
	let page = 0

	while (true) {
		const total = await vacancyService.countActive()
		if (!total) {
			await replaceBotMessage(ctx, '❌ Hozirda faol vakansiyalar yo‘q.')
			throw navError('CANCEL')
		}

		const totalPages = Math.max(1, Math.ceil(total / perPage))
		page = Math.max(0, Math.min(page, totalPages - 1))
		const vacancies = await vacancyService.listActivePage(page, perPage)

		const kb = new InlineKeyboard()
		const lines = [`📌 *Vakansiyalar ro‘yxati*`, `Sahifa: *${page + 1}/${totalPages}*`, '']

		for (const vacancy of vacancies) {
			lines.push(
				`• *${escapeMarkdown(vacancy.title)}*${
					vacancy.salary ? ` — ${escapeMarkdown(vacancy.salary)}` : ''
				}`
			)
			kb.text(vacancy.title, `VAC|OPEN|${vacancy.id}`).row()
		}

		if (page > 0) kb.text('⬅️ Oldingi', 'VAC|PAGE|PREV')
		if (page < totalPages - 1) kb.text('➡️ Keyingi', 'VAC|PAGE|NEXT')
		kb.row().text('❌ Bekor qilish', 'NAV|CANCEL')

		await replaceBotMessage(ctx, lines.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: kb
		})

		const upd = await conversation.wait()
		if (!upd.callbackQuery?.data) continue

		await upd.answerCallbackQuery().catch(() => {})
		const data = upd.callbackQuery.data

		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data === 'VAC|PAGE|PREV') {
			page--
			continue
		}
		if (data === 'VAC|PAGE|NEXT') {
			page++
			continue
		}

		if (!data.startsWith('VAC|OPEN|')) continue

		const vacancyId = data.split('|')[2]
		const vacancy = await vacancyService.getWithQuestions(vacancyId)
		if (!vacancy) continue

		const detailText = [
			`📌 *Vakansiya haqida:* ${escapeMarkdown(vacancy.title)}`,
			vacancy.description
				? `\n${escapeMarkdown(vacancy.description)}`
				: '\nVakansiya haqida ma’lumot kiritilmagan.',
			'',
			`💰 *Maosh:* ${escapeMarkdown(vacancy.salary || 'Kelishiladi')}`,
			'',
			'Ariza berishni xohlaysizmi?'
		].join('\n')

		const choice = await askInline(
			conversation,
			ctx,
			detailText,
			[
				{ text: '✅ Ariza berish', data: `VAC|APPLY|${vacancy.id}` },
				{ text: '⬅️ Orqaga', data: 'VAC|LIST|BACK' }
			],
			{ cancel: true, columns: 1 }
		)

		if (choice === 'VAC|LIST|BACK') continue
		if (choice.startsWith('VAC|APPLY|')) return choice.split('|')[2]
	}
}

function getEffectiveQuestions(vacancy: any): EffectiveQuestion[] {
	console.log('Vacancy questions:', JSON.stringify(vacancy.questions, null, 2))

	if (vacancy.questions?.length) {
		const mapped = vacancy.questions.map((q: any) => ({
			id: q.id,
			question: q.question,
			type: q.type,
			options: q.options?.map((o: any) => ({ text: o.text, value: o.value }))
		}))
		console.log('Mapped questions:', JSON.stringify(mapped, null, 2))
		return mapped
	}

	console.log('Using fallback questions')
	return getFallbackQuestions()
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	let timer: NodeJS.Timeout | undefined

	const timeoutPromise = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
	})

	try {
		return await Promise.race([promise, timeoutPromise])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

async function waitForSpecificCallback(
	conversation: Conversation<BotContext>,
	messageId: number
): Promise<string> {
	while (true) {
		const cbCtx = await conversation.waitFor('callback_query:data')
		const data = cbCtx.callbackQuery?.data
		const callbackMessageId = cbCtx.callbackQuery?.message?.message_id

		await cbCtx.answerCallbackQuery().catch(() => {})

		if (!data) continue
		if (callbackMessageId !== messageId) continue

		return data
	}
}

export async function applicationFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return

	try {
		await userService.upsertFromCtx(ctx)
		ctx.session.temp ??= {} as any

		if (!ctx.session.applicationId) {
			const user = await userService.upsertFromCtx(ctx)
			const app = await applicationService.createApplication(telegramId, {
				userId: user?.id ?? null
			})
			ctx.session.applicationId = app.id
		}

		const applicationId = ctx.session.applicationId!

		if (!ctx.session.temp.vacancyId) {
			await replaceBotMessage(
				ctx,
				'✨ *Assalomu alaykum!*\n\nVakansiyani tanlang. Avval ma’lumot chiqadi, keyin ariza topshirasiz.',
				{ parse_mode: 'Markdown' }
			)
			ctx.session.temp.vacancyId = await pickVacancy(conversation, ctx)
			await applicationService.setVacancy(applicationId, ctx.session.temp.vacancyId)
		}

		const vacancy = await vacancyService.getWithQuestions(ctx.session.temp.vacancyId)
		if (!vacancy) {
			await replaceBotMessage(ctx, '❌ Vakansiya topilmadi.')
			return
		}

		const effectiveQuestions = getEffectiveQuestions(vacancy)

		logger.info(
			{
				questionsCount: effectiveQuestions.length,
				questions: effectiveQuestions.map(q => ({ id: q.id, type: q.type }))
			},
			'Effective questions loaded'
		)

		if (!ctx.session.temp.fullName) {
			const defaultName = [ctx.from?.first_name, ctx.from?.last_name]
				.filter(Boolean)
				.join(' ')
				.trim()

			const nameQuestion = defaultName
				? `👤 Ism, familiyangizni kiriting:\n\nTelegramdagi ism: ${defaultName}`
				: '👤 Ism, familiyangizni kiriting:'

			ctx.session.temp.fullName = (
				await askText(conversation, ctx, nameQuestion, { cancel: true })
			).trim()
		}

		if (!ctx.session.temp.phone) {
			ctx.session.temp.phone = (
				await askPhone(
					conversation,
					ctx,
					'📞 *Telefon raqamingizni kiriting yoki tugma orqali yuboring:*',
					{ cancel: true }
				)
			).trim()

			await ctx.reply('✅ Telefon qabul qilindi.', {
				reply_markup: { remove_keyboard: true }
			})
		}

		if (!ctx.session.temp.photoFileId) {
			await sendDemoPhoto(ctx)

			const photoFileId = await askPhoto(
				conversation,
				ctx,
				'📸 *3x4 rasm yuboring*\n\nDemo xabardan keyin shu yerga rasmni jo‘nating.'
			)

			ctx.session.temp.photoFileId = photoFileId

			const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda... Iltimos, kuting...')

			try {
				const validated = await photoService.validateTelegramPhoto(ctx, photoFileId, {
					minWidth: 1,
					minHeight: 1,
					minRatio: 0,
					maxRatio: 10
				})

				if (validated.ok) {
					const uploaded = await withTimeout(
						photoService.uploadBufferToCloudinary(validated.buffer),
						15000,
						'cloudinary upload'
					)

					await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId, {
						cloudinaryUrl: uploaded.secureUrl,
						cloudinaryPublicId: uploaded.publicId,
						meta: { faces: uploaded.faces }
					})

					ctx.session.temp.photoUrl = uploaded.secureUrl
				} else {
					await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId)
				}

				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
			} catch (uploadErr) {
				logger.warn(
					{ err: uploadErr, applicationId, photoFileId },
					'Cloudinary upload failed, saving telegram file id only'
				)

				await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId)
				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
			}

			await replaceBotMessage(ctx, '✅ Rasm qabul qilindi!')
		}

		ctx.session.temp.vacancyAnswers ??= {}

		// MUHIM: Avval full_name, phone_number va photo ni to'ldirish
		ctx.session.temp.vacancyAnswers['full_name'] = ctx.session.temp.fullName
		ctx.session.temp.vacancyAnswers['phone_number'] = ctx.session.temp.phone
		ctx.session.temp.vacancyAnswers['photo'] =
			ctx.session.temp.photoUrl || ctx.session.temp.photoFileId

		// Qolgan savollarni ketma-ket so'rash
		// for (const question of effectiveQuestions) {
		// 	const questionKey = question.id

		// 	// Skip already answered questions
		// 	if (ctx.session.temp.vacancyAnswers[questionKey]) {
		// 		continue
		// 	}

		// 	// Skip base fields that are already handled
		// 	if (
		// 		questionKey === 'full_name' ||
		// 		questionKey === 'phone_number' ||
		// 		questionKey === 'photo'
		// 	) {
		// 		continue
		// 	}

		// 	// TEXT type questions
		// 	if (question.type === 'TEXT') {
		// 		let questionText = buildQuestionText(question.question)

		// 		if (question.id === 'birth_date') {
		// 			questionText =
		// 				'📅 *Tug‘ilgan sanangizni kiriting*\n\n' +
		// 				'Iltimos, quyidagi formatda yozing: **KK.OO.YYYY**\n\n' +
		// 				'Masalan: 12.04.2004'
		// 		}

		// 		const answer = await askText(conversation, ctx, questionText, {
		// 			cancel: true,
		// 			validate: getQuestionValidator(question)
		// 		})

		// 		ctx.session.temp.vacancyAnswers[questionKey] = answer
		// 		logger.info(
		// 			{ applicationId, questionId: question.id, question: question.question, answer },
		// 			'Application TEXT answer saved to session'
		// 		)
		// 		continue
		// 	}

		// 	// SINGLE_SELECT type questions
		// 	if (question.type === 'SINGLE_SELECT' && question.options?.length) {
		// 		const answer = await askInline(
		// 			conversation,
		// 			ctx,
		// 			`❓ *${escapeMarkdown(question.question)}*`,
		// 			question.options.map(opt => ({
		// 				text: opt.text,
		// 				data: `QSEL|${question.id}|${opt.value}`
		// 			})),
		// 			{ cancel: true, columns: 2 }
		// 		)

		// 		const parsedValue = answer.startsWith(`QSEL|${question.id}|`)
		// 			? answer.split('|')[2]
		// 			: answer

		// 		ctx.session.temp.vacancyAnswers[questionKey] = parsedValue
		// 		logger.info(
		// 			{
		// 				applicationId,
		// 				questionId: question.id,
		// 				question: question.question,
		// 				answer: parsedValue
		// 			},
		// 			'Application SINGLE_SELECT answer saved to session'
		// 		)
		// 		continue
		// 	}

		// 	// MULTI_SELECT type questions
		// 	if (question.type === 'MULTI_SELECT' && question.options?.length) {
		// 		const answer = await askMultiSelect(
		// 			conversation,
		// 			ctx,
		// 			`❓ *${escapeMarkdown(question.question)}*\n\n(Bir nechta tanlashingiz mumkin)`,
		// 			question.options.map(opt => ({ key: opt.value, label: opt.text })),
		// 			new Set<string>(),
		// 			{ cancel: true }
		// 		)

		// 		ctx.session.temp.vacancyAnswers[questionKey] = Array.from(answer).join(', ')
		// 		logger.info(
		// 			{
		// 				applicationId,
		// 				questionId: question.id,
		// 				question: question.question,
		// 				answer: Array.from(answer).join(', ')
		// 			},
		// 			'Application MULTI_SELECT answer saved to session'
		// 		)
		// 		continue
		// 	}
		// }
		// Qolgan savollarni ketma-ket so'rash
		for (const question of effectiveQuestions) {
			const questionKey = question.id

			// MUHIM DEBUG: Har bir savolni tekshirish
			logger.info(
				{
					questionId: question.id,
					questionType: question.type,
					alreadyAnswered: Boolean(ctx.session.temp.vacancyAnswers[questionKey]),
					existingAnswer: ctx.session.temp.vacancyAnswers[questionKey]
				},
				'Processing question'
			)

			// Skip already answered questions
			if (ctx.session.temp.vacancyAnswers[questionKey]) {
				logger.info({ questionId: question.id }, 'Skipping already answered question')
				continue
			}

			// Skip base fields that are already handled
			if (
				questionKey === 'full_name' ||
				questionKey === 'phone_number' ||
				questionKey === 'photo'
			) {
				logger.info({ questionId: question.id }, 'Skipping base field')
				continue
			}

			logger.info({ questionId: question.id }, 'Asking question to user')

			// TEXT type questions
			if (question.type === 'TEXT') {
				let questionText = buildQuestionText(question.question)

				if (question.id === 'birth_date') {
					questionText =
						'📅 *Tug‘ilgan sanangizni kiriting*\n\n' +
						'Iltimos, quyidagi formatda yozing: **KK.OO.YYYY**\n\n' +
						'Masalan: 12.04.2004'
				}

				const answer = await askText(conversation, ctx, questionText, {
					cancel: true,
					validate: getQuestionValidator(question)
				})

				ctx.session.temp.vacancyAnswers[questionKey] = answer
				logger.info(
					{ applicationId, questionId: question.id, question: question.question, answer },
					'Application TEXT answer saved to session'
				)
				continue
			}

			// SINGLE_SELECT type questions
			if (question.type === 'SINGLE_SELECT' && question.options?.length) {
				logger.info({ questionId: question.id, options: question.options }, 'Asking SINGLE_SELECT')

				const answer = await askInline(
					conversation,
					ctx,
					`❓ *${escapeMarkdown(question.question)}*`,
					question.options.map(opt => ({
						text: opt.text,
						data: `QSEL|${question.id}|${opt.value}`
					})),
					{ cancel: true, columns: 2 }
				)

				const parsedValue = answer.startsWith(`QSEL|${question.id}|`)
					? answer.split('|')[2]
					: answer

				ctx.session.temp.vacancyAnswers[questionKey] = parsedValue
				logger.info(
					{
						applicationId,
						questionId: question.id,
						question: question.question,
						answer: parsedValue
					},
					'Application SINGLE_SELECT answer saved to session'
				)
				continue
			}

			// MULTI_SELECT type questions
			if (question.type === 'MULTI_SELECT' && question.options?.length) {
				const answer = await askMultiSelect(
					conversation,
					ctx,
					`❓ *${escapeMarkdown(question.question)}*\n\n(Bir nechta tanlashingiz mumkin)`,
					question.options.map(opt => ({ key: opt.value, label: opt.text })),
					new Set<string>(),
					{ cancel: true }
				)

				ctx.session.temp.vacancyAnswers[questionKey] = Array.from(answer).join(', ')
				logger.info(
					{
						applicationId,
						questionId: question.id,
						question: question.question,
						answer: Array.from(answer).join(', ')
					},
					'Application MULTI_SELECT answer saved to session'
				)
				continue
			}
		}
		// Anketa tayyor
		const summary = [
			'📄 *Anketa tayyor!*',
			'',
			'*Maʼlumotlaringiz:*',
			`👤 Ism: ${escapeMarkdown(ctx.session.temp.fullName || '')}`,
			`📞 Telefon: ${escapeMarkdown(ctx.session.temp.phone || '')}`,
			`📌 Vakansiya: ${escapeMarkdown(vacancy.title || '')}`,
			ctx.session.temp.photoUrl ? `🖼 Rasm: ${escapeMarkdown(ctx.session.temp.photoUrl)}` : '',
			'',
			'Tasdiqlaysizmi?'
		].filter(Boolean)

		const confirmKb = new InlineKeyboard()
			.text('✅ Ha', 'CONFIRM|YES')
			.text('❌ Yo‘q', 'CONFIRM|NO')

		const sentMsg = await ctx.reply(summary.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: confirmKb
		})
		ctx.session.lastBotMessageId = sentMsg.message_id

		const data = await waitForSpecificCallback(conversation, sentMsg.message_id)
		logger.info({ data, applicationId }, 'Confirmation callback received')

		if (data === 'CONFIRM|NO') {
			await applicationService.cancelApplication(applicationId)
			ctx.session.applicationId = undefined
			ctx.session.temp = {} as any
			ctx.session.lastBotMessageId = undefined

			await replaceBotMessage(
				ctx,
				'❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start bosing.',
				{ parse_mode: 'Markdown' }
			)
			return
		}

		if (data !== 'CONFIRM|YES') {
			throw navError('CANCEL')
		}

		logger.info({ applicationId }, 'Start saving answers')

		// Save all answers to database
		await applicationService.saveAnswer(
			applicationId,
			'full_name',
			ctx.session.temp.fullName,
			'TEXT' as any
		)

		await applicationService.saveAnswer(
			applicationId,
			'phone',
			ctx.session.temp.phone,
			'PHONE' as any
		)

		for (const [key, value] of Object.entries(ctx.session.temp.vacancyAnswers)) {
			if (value && typeof value === 'string') {
				await applicationService.saveAnswer(applicationId, key, value, 'TEXT' as any)
			}
		}

		logger.info({ applicationId }, 'All answers saved')

		await applicationService.submitApplication(applicationId)
		logger.info({ applicationId }, 'Application submitted')

		const adminChatIds = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
			.map(v => Number(v || 0))
			.filter(Boolean)

		logger.info({ adminChatIds, applicationId }, 'Sending application to admins')

		const adminMessage = [
			`🆕 *Yangi ariza #${escapeMarkdown(applicationId.slice(0, 8))}*`,
			'',
			`👤 Ism: ${escapeMarkdown(ctx.session.temp.fullName || '')}`,
			`📞 Telefon: ${escapeMarkdown(ctx.session.temp.phone || '')}`,
			`📌 Vakansiya: ${escapeMarkdown(vacancy.title || '')}`,
			ctx.session.temp.photoUrl ? `🖼 Rasm: ${escapeMarkdown(ctx.session.temp.photoUrl)}` : '',
			''
		]

		for (const question of effectiveQuestions) {
			const answer = ctx.session.temp.vacancyAnswers[question.id]
			if (!answer) continue
			adminMessage.push(`• ${escapeMarkdown(question.question)}: ${escapeMarkdown(String(answer))}`)
		}

		const adminKb = new InlineKeyboard()
			.text('✅ Qabul qilish', `AD|APPROVE|${applicationId}`)
			.text('❌ Rad etish', `AD|REJECT|${applicationId}`)

		for (const adminChatId of adminChatIds) {
			try {
				await ctx.api.sendMessage(adminChatId, adminMessage.filter(Boolean).join('\n'), {
					parse_mode: 'Markdown',
					reply_markup: adminKb,
					link_preview_options: { is_disabled: true }
				})
				logger.info({ adminChatId, applicationId }, 'Admin notified')
			} catch (err) {
				logger.error({ err, adminChatId, applicationId }, 'Failed to notify admin')
			}
		}
		logger.info(
			{
				allQuestionsProcessed: true,
				answersCount: Object.keys(ctx.session.temp.vacancyAnswers).length,
				answers: ctx.session.temp.vacancyAnswers
			},
			'All questions processed, moving to summary'
		)


		await ctx.reply(
			'✅ *Anketa topshirildi!*\n\nSizning arizangiz qabul qilindi. Admin tez orada bog‘lanadi.',
			{ parse_mode: 'Markdown' }
		)

		const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
		const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
		const isUserAdmin = telegramId === admin1 || telegramId === admin2

		if (isUserAdmin) {
			await ctx.reply('👨‍💼 Admin panelga o‘tish uchun:', {
				reply_markup: new InlineKeyboard().text('📋 Admin panel', 'GO_TO_ADMIN')
			})
		}

		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		await ctx.conversation.exit()
	} catch (err) {
		if (isNavSignal(err) && ctx.session.applicationId) {
			const result = await handleNavSignal(ctx, ctx.session.applicationId, err.message as NavSignal)
			if (result === 'RETURN') return
		}

		logger.error({ err, userId: ctx.from?.id }, 'applicationFlow failed')
		await replaceBotMessage(ctx, 'Xatolik yuz berdi. /start bilan qayta urinib ko‘ring.')
	}
}
