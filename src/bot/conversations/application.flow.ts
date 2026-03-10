import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, InputFile } from 'grammy'
import { AnswerFieldType, FileType } from '../../generated/prisma/client'

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
	askChoice,
	replaceBotMessage,
	isNavSignal,
	navError,
	type NavSignal,
	deletePrevBotMessage,
	escapeMarkdown
} from './flow-helpers'
import { showStartMenu } from '../start.menu'
import { CallbackData } from '../../config/constants'
import { getUserLang, t } from '../../utils/i18n'

const DEFAULT_RECEPTION_QUESTIONS = [
	{ id: 'full_name', type: 'TEXT' as const, uz: 'Ism va familiyangizni kiriting.', ru: 'Введите имя и фамилию.' },
	{ id: 'birth_date', type: 'TEXT' as const, uz: 'Tug‘ilgan sana yoki yoshingizni yozing.', ru: 'Укажите дату рождения или возраст.' },
	{ id: 'address', type: 'TEXT' as const, uz: 'Yashash manzilingizni kiriting (tuman / shahar).', ru: 'Укажите адрес проживания (район / город).' },
	{ id: 'phone_number', type: 'PHONE' as const, uz: 'Telefon raqamingizni yuboring.', ru: 'Отправьте номер телефона.' },
	{ id: 'family_status', type: 'SELECT' as const, uz: 'Oilaviy holatingizni tanlang.', ru: 'Выберите семейное положение.' },
	{ id: 'last_education', type: 'SELECT' as const, uz: 'Oxirgi tugatgan o‘quv yurtingizni tanlang.', ru: 'Выберите последнее учебное заведение.' },
	{ id: 'speciality', type: 'TEXT' as const, uz: 'Mutaxassisligingizni yozing.', ru: 'Укажите специальность.' },
	{ id: 'certificates', type: 'TEXT_OPTIONAL' as const, uz: 'Til yoki fan bo‘yicha sertifikatlaringiz bo‘lsa yozing, bo‘lmasa o‘tkazib yuboring.', ru: 'Если есть сертификаты по языкам или предметам, укажите их, иначе пропустите.' },
	{ id: 'worked_before', type: 'TEXT' as const, uz: 'Oldin qayerda ishlagansiz?', ru: 'Где вы работали ранее?' },
	{ id: 'work_duration', type: 'TEXT' as const, uz: 'U yerda qancha muddat ishlagansiz?', ru: 'Сколько времени вы там работали?' },
	{ id: 'position', type: 'TEXT' as const, uz: 'Qaysi lavozimda ishlagansiz?', ru: 'На какой должности вы работали?' },
	{ id: 'leave_reason', type: 'TEXT' as const, uz: 'Nima sababdan ishdan chiqqansiz?', ru: 'Почему вы ушли с предыдущей работы?' },
	{ id: 'can_work_duration', type: 'TEXT' as const, uz: 'Biz bilan taxminan qancha muddat ishlay olasiz?', ru: 'Как долго вы сможете работать с нами?' },
	{ id: 'computer_skills', type: 'SELECT' as const, uz: 'Kompyuter ko‘nikmangiz darajasini tanlang.', ru: 'Выберите уровень компьютерных навыков.' },
	{ id: 'communication_skill', type: 'SELECT' as const, uz: 'Muloqot qobiliyatingizni baholang.', ru: 'Оцените свои коммуникативные навыки.' },
	{ id: 'phone_answering', type: 'SELECT' as const, uz: 'Telefon qo‘ng‘iroqlariga javob bera olasizmi?', ru: 'Можете ли вы отвечать на телефонные звонки?' },
	{ id: 'client_experience', type: 'SELECT' as const, uz: 'Mijozlar bilan ishlash tajribangiz bormi?', ru: 'Есть ли у вас опыт работы с клиентами?' },
	{ id: 'appearance', type: 'SELECT' as const, uz: 'Kiyinish madaniyatiga rioya qilasizmi?', ru: 'Соблюдаете ли вы деловой внешний вид?' },
	{ id: 'stress', type: 'SELECT' as const, uz: 'Stressga chidamlilik darajangizni tanlang.', ru: 'Выберите уровень стрессоустойчивости.' },
	{ id: 'work_schedule', type: 'SELECT' as const, uz: 'Qaysi ish rejimida ishlay olasiz?', ru: 'В каком графике вы можете работать?' },
	{ id: 'salary_expectation', type: 'SELECT' as const, uz: 'Kutilayotgan oylik maoshingizni tanlang.', ru: 'Выберите ожидаемую зарплату.' },
	{ id: 'photo', type: 'PHOTO' as const, uz: 'Beldan tepaga tushgan aniq rasm yuboring.', ru: 'Отправьте чёткое фото по пояс.' }
] as const

const SELECT_OPTIONS: Record<string, { text: Record<'uz' | 'ru', string>; value: string }[]> = {
	family_status: [
		{ value: 'Turmush qurmagan', text: { uz: 'Turmush qurmagan', ru: 'Не женат / не замужем' } },
		{ value: 'Uylangan / turmush qurgan', text: { uz: 'Uylangan / turmush qurgan', ru: 'Женат / замужем' } },
		{ value: 'Ajrashgan', text: { uz: 'Ajrashgan', ru: 'Разведён(а)' } }
	],
	last_education: [
		{ value: 'Maktab', text: { uz: 'Maktab', ru: 'Школа' } },
		{ value: 'Kollej / litsey', text: { uz: 'Kollej / litsey', ru: 'Колледж / лицей' } },
		{ value: 'Oliy ta’lim', text: { uz: 'Oliy ta’lim', ru: 'Высшее образование' } }
	],
	computer_skills: [
		{ value: 'Boshlang‘ich', text: { uz: 'Boshlang‘ich', ru: 'Базовый' } },
		{ value: 'O‘rta', text: { uz: 'O‘rta', ru: 'Средний' } },
		{ value: 'Yaxshi', text: { uz: 'Yaxshi', ru: 'Хороший' } }
	],
	communication_skill: [
		{ value: 'O‘rta', text: { uz: 'O‘rta', ru: 'Средняя' } },
		{ value: 'Yaxshi', text: { uz: 'Yaxshi', ru: 'Хорошая' } },
		{ value: 'Juda yaxshi', text: { uz: 'Juda yaxshi', ru: 'Очень хорошая' } }
	],
	phone_answering: [
		{ value: 'Ha', text: { uz: 'Ha', ru: 'Да' } },
		{ value: 'Yo‘q', text: { uz: 'Yo‘q', ru: 'Нет' } }
	],
	client_experience: [
		{ value: 'Bor', text: { uz: 'Bor', ru: 'Есть' } },
		{ value: 'Yo‘q', text: { uz: 'Yo‘q', ru: 'Нет' } }
	],
	appearance: [
		{ value: 'Ha', text: { uz: 'Ha', ru: 'Да' } },
		{ value: 'Yo‘q', text: { uz: 'Yo‘q', ru: 'Нет' } }
	],
	stress: [
		{ value: 'Past', text: { uz: 'Past', ru: 'Низкая' } },
		{ value: 'O‘rta', text: { uz: 'O‘rta', ru: 'Средняя' } },
		{ value: 'Yuqori', text: { uz: 'Yuqori', ru: 'Высокая' } }
	],
	work_schedule: [
		{ value: 'To‘liq stavka', text: { uz: 'To‘liq stavka', ru: 'Полный день' } },
		{ value: 'Yarim stavka', text: { uz: 'Yarim stavka', ru: 'Неполный день' } }
	],
	salary_expectation: [
		{ value: '1 000 000 so‘m', text: { uz: '1 000 000 so‘m', ru: '1 000 000 сум' } },
		{ value: '2 000 000 so‘m', text: { uz: '2 000 000 so‘m', ru: '2 000 000 сум' } },
		{ value: '3 000 000 so‘m', text: { uz: '3 000 000 so‘m', ru: '3 000 000 сум' } },
		{ value: 'Kelishiladi', text: { uz: 'Kelishiladi', ru: 'Договорная' } }
	]
}


type EffectiveQuestion = (typeof DEFAULT_RECEPTION_QUESTIONS)[number]

function localizedQuestion(ctx: BotContext, q: { uz: string; ru: string }): string {
	return getUserLang(ctx) === 'ru' ? q.ru : q.uz
}

async function askSelectAnswer(conversation: Conversation<BotContext>, ctx: BotContext, question: EffectiveQuestion): Promise<string> {
	const options = SELECT_OPTIONS[question.id] || []
	const lang = getUserLang(ctx)
	const picked = await askChoice(
		conversation,
		ctx,
		`❓ *${escapeMarkdown(localizedQuestion(ctx, question))}*`,
		options.map((o, i) => ({ text: o.text[lang], data: `SEL|${question.id}|${i}` })),
		{ cancel: true, columns: 2 }
	)
	const idx = Number((picked || '').split('|')[2] || -1)
	return idx >= 0 && options[idx] ? options[idx].value : ''
}

function adminFieldLabel(ctx: BotContext, id: string): string {
	const q = DEFAULT_RECEPTION_QUESTIONS.find(item => item.id === id)
	return q ? localizedQuestion(ctx, q) : id
}

async function handleNavSignal(ctx: BotContext, applicationId: string, signal: NavSignal): Promise<'CONTINUE' | 'RETURN'> {
	if (signal === 'CANCEL') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = { answers: {}, language: ctx.session.temp?.language }
		ctx.session.lastBotMessageId = undefined
		await replaceBotMessage(
			ctx,
			getUserLang(ctx) === 'ru'
				? '❌ *Заявка отменена.*\n\nНажмите /start, чтобы начать заново.'
				: '❌ *Ariza bekor qilindi.*\n\nQayta boshlash uchun /start ni bosing.',
			{ parse_mode: 'Markdown' }
		)
		return 'RETURN'
	}
	if (signal === 'START') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = { answers: {}, language: ctx.session.temp?.language }
		ctx.session.lastBotMessageId = undefined
		await showStartMenu(ctx)
		return 'RETURN'
	}
	if (signal === 'ADMIN') {
		throw navError('ADMIN')
	}
	return 'CONTINUE'
}

async function sendDemoPhoto(ctx: BotContext): Promise<void> {
	const buffer = await photoService.getDemoPhotoBuffer()
	if (!buffer) return
	try {
		await ctx.replyWithPhoto(new InputFile(buffer, 'example.jpg'), {
			caption:
				getUserLang(ctx) === 'ru'
					? 'Пример фотографии для анкеты.'
					: 'Anketa uchun rasm namunasi.'
		})
	} catch (err) {
		logger.warn({ err }, 'Failed to send demo photo')
	}
}

async function askOptionalFile(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	question: string
): Promise<{ fileId: string; kind: 'photo' | 'document' } | null> {
	const kb = new InlineKeyboard()
		.text(getUserLang(ctx) === 'ru' ? '⏭ Пропустить' : '⏭ O‘tkazib yuborish', CallbackData.NAV_SKIP)
		.text(t(ctx, 'cancel'), CallbackData.NAV_CANCEL)
	await replaceBotMessage(ctx, `📎 *${escapeMarkdown(question)}*`, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
	while (true) {
		const upd = await conversation.wait()
		if (upd.callbackQuery?.data) {
			await upd.answerCallbackQuery().catch(() => undefined)
			if (upd.callbackQuery.data === CallbackData.NAV_SKIP) return null
			if (upd.callbackQuery.data === CallbackData.NAV_CANCEL) throw navError('CANCEL')
			continue
		}
		const text = upd.message?.text?.trim()
		if (text === '/start') throw navError('START')
		if (text === '/admin') throw navError('ADMIN')
		if (text === '/cancel') throw navError('CANCEL')
		if (upd.message?.photo?.length) return { fileId: upd.message.photo.at(-1)!.file_id, kind: 'photo' }
		if (upd.message?.document) return { fileId: upd.message.document.file_id, kind: 'document' }
		await replaceBotMessage(
			ctx,
			getUserLang(ctx) === 'ru'
				? 'Отправьте файл/фото или нажмите «Пропустить».'
				: 'Fayl yoki rasm yuboring, yoki “O‘tkazib yuborish” tugmasini bosing.',
			{ reply_markup: kb }
		)
	}
}

async function pickVacancy(conversation: Conversation<BotContext>, ctx: BotContext): Promise<string> {
	let page = 0
	const perPage = 5
	while (true) {
		const total = await vacancyService.countActive()
		if (!total) {
			await ctx.reply(getUserLang(ctx) === 'ru' ? 'Сейчас активных вакансий нет.' : 'Hozircha faol vakansiyalar yoʻq.')
			throw navError('START')
		}
		const totalPages = Math.max(1, Math.ceil(total / perPage))
		page = Math.max(0, Math.min(page, totalPages - 1))
		const vacancies = await vacancyService.listActivePage(page, perPage)
		const kb = new InlineKeyboard()
		const text: string[] = [
			`${t(ctx, 'vacancyListTitle')} (${page + 1}/${totalPages})`,
			'',
			getUserLang(ctx) === 'ru'
				? 'Нажмите на вакансию, чтобы открыть подробности.'
				: 'Batafsil ma’lumotni ko‘rish uchun vakansiyani tanlang.'
		]
		for (const vacancy of vacancies) {
			text.push(`• *${escapeMarkdown(vacancy.title)}*`)
			if (vacancy.salary) text.push(`  💰 ${escapeMarkdown(vacancy.salary)}`)
			if (vacancy.description) text.push(`  📝 ${escapeMarkdown(vacancy.description.slice(0, 70))}`)
			text.push('')
			kb.text(vacancy.title, `VAC|VIEW|${vacancy.id}`).row()
		}
		if (page > 0) kb.text('⬅️', 'VAC|PAGE|PREV')
		if (page < totalPages - 1) kb.text('➡️', 'VAC|PAGE|NEXT')
		kb.row().text(t(ctx, 'backMain'), 'VAC|BACK_MAIN')
		await replaceBotMessage(ctx, text.join('\n'), { parse_mode: 'Markdown', reply_markup: kb })
		const upd = await conversation.waitFor('callback_query:data')
		const data = upd.callbackQuery.data
		await upd.answerCallbackQuery().catch(() => undefined)
		if (data === 'VAC|BACK_MAIN') throw navError('START')
		if (data === 'VAC|PAGE|PREV') {
			page--
			continue
		}
		if (data === 'VAC|PAGE|NEXT') {
			page++
			continue
		}
		if (data.startsWith('VAC|VIEW|')) {
			const vacancyId = data.split('|')[2]
			const vacancy = await vacancyService.getWithQuestions(vacancyId)
			if (!vacancy) continue
			const detail = [
				`📌 *${escapeMarkdown(vacancy.title)}*`,
				'',
				vacancy.description
					? `📝 ${escapeMarkdown(vacancy.description)}`
					: getUserLang(ctx) === 'ru'
						? '📝 Описание не указано.'
						: '📝 Tavsif kiritilmagan.',
				'',
				vacancy.salary
					? `💰 ${escapeMarkdown(vacancy.salary)}`
					: getUserLang(ctx) === 'ru'
						? '💰 Зарплата обсуждается.'
						: '💰 Maosh kelishiladi.'
			].join('\n')
			const detailKb = new InlineKeyboard()
				.text(t(ctx, 'apply'), `VAC|APPLY|${vacancy.id}`)
				.row()
				.text('⬅️', 'VAC|BACK_TO_LIST')
				.text(t(ctx, 'backMain'), 'VAC|BACK_MAIN')
			await deletePrevBotMessage(ctx)
			if (vacancy.imageUrl) {
				const sent = await ctx.replyWithPhoto(vacancy.imageUrl, {
					caption: detail,
					parse_mode: 'Markdown',
					reply_markup: detailKb
				})
				ctx.session.lastBotMessageId = sent.message_id
			} else {
				await replaceBotMessage(ctx, detail, { parse_mode: 'Markdown', reply_markup: detailKb })
			}
			const choice = await conversation.waitFor('callback_query:data')
			const choiceData = choice.callbackQuery.data
			await choice.answerCallbackQuery().catch(() => undefined)
			if (choiceData === 'VAC|BACK_TO_LIST') continue
			if (choiceData === 'VAC|BACK_MAIN') throw navError('START')
			if (choiceData.startsWith('VAC|APPLY|')) return choiceData.split('|')[2]
		}
	}
}

function getEffectiveQuestions(): EffectiveQuestion[] {
	return [...DEFAULT_RECEPTION_QUESTIONS]
}

function buildAdminApplicationHeader(ctx: BotContext, applicationId: string, vacancyTitle: string, answers: Record<string, string>): string[] {
	return [
		`${getUserLang(ctx) === 'ru' ? '🆕 Новая заявка' : '🆕 Yangi ariza'} #${applicationId.slice(0, 8)}`,
		`👤 ${getUserLang(ctx) === 'ru' ? 'ФИО' : 'F.I.Sh'}: ${answers.full_name || '—'}`,
		`📞 ${getUserLang(ctx) === 'ru' ? 'Телефон' : 'Telefon'}: ${answers.phone_number || '—'}`,
		`📌 ${getUserLang(ctx) === 'ru' ? 'Вакансия' : 'Vakansiya'}: ${vacancyTitle}`,
		`🕒 ${getUserLang(ctx) === 'ru' ? 'Отправлено' : 'Topshirildi'}: ${new Date().toLocaleString('ru-RU')}`
	]
}

function buildAdminApplicationDetails(ctx: BotContext, answers: Record<string, string>): string {
	const visibleFields = ['birth_date', 'address', 'family_status', 'last_education', 'speciality', 'worked_before', 'work_duration', 'position', 'leave_reason', 'can_work_duration', 'computer_skills', 'communication_skill', 'phone_answering', 'client_experience', 'appearance', 'stress', 'work_schedule', 'salary_expectation']
	const lines: string[] = []
	for (const question of getEffectiveQuestions()) {
		const value = answers[question.id]
		if (!value || question.type === 'PHOTO' || !visibleFields.includes(question.id)) continue
		lines.push(`• ${adminFieldLabel(ctx, question.id)}: ${value}`)
	}
	return lines.join('\n')
}

export async function applicationFlow(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return
	ctx.session.temp ??= { answers: {} } as any
	getUserLang(ctx)

	try {
		const user = await userService.upsertFromCtx(ctx)
		const vacancyId = await pickVacancy(conversation, ctx)
		ctx.session.temp.vacancyId = vacancyId
		const vacancy = await vacancyService.getWithQuestions(vacancyId)
		if (!vacancy) {
			await replaceBotMessage(ctx, '❌ Vakansiya topilmadi.')
			return
		}

		const app = await applicationService.createApplication(telegramId, {
			vacancyId,
			userId: user?.id ?? null
		})
		ctx.session.applicationId = app.id
		const applicationId = app.id
		const answers: Record<string, string> = {}

		for (const question of getEffectiveQuestions()) {
			await applicationService.updateCurrentStep(applicationId, question.id)
			if (question.type === 'SELECT') {
				const value = await askSelectAnswer(conversation, ctx, question)
				answers[question.id] = value.trim()
				await applicationService.saveAnswer(applicationId, question.id, answers[question.id], AnswerFieldType.TEXT)
				continue
			}
			if (question.type === 'PHONE') {
				const phone = await askPhone(conversation, ctx, `📞 *${escapeMarkdown(localizedQuestion(ctx, question))}*`, { cancel: true })
				answers[question.id] = phone.trim()
				ctx.session.temp.phone = phone.trim()
				await applicationService.saveAnswer(applicationId, question.id, answers[question.id], AnswerFieldType.PHONE)
				continue
			}
			if (question.type === 'PHOTO') {
				await sendDemoPhoto(ctx)
				const fileId = await askOptionalFile(conversation, ctx, localizedQuestion(ctx, question))
				if (!fileId) throw navError('CANCEL')
				const validated = await photoService.validateTelegramPhoto(ctx, fileId.fileId, {
					minWidth: 1,
					minHeight: 1,
					minRatio: 0,
					maxRatio: 10
				})
				if (validated.ok) {
					const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)
					await applicationService.saveFile(applicationId, FileType.HALF_BODY, fileId.fileId, {
						cloudinaryUrl: uploaded.secureUrl,
						cloudinaryPublicId: uploaded.publicId,
						meta: { faces: uploaded.faces }
					})
					answers[question.id] = uploaded.secureUrl
					ctx.session.temp.photoUrl = uploaded.secureUrl
				} else {
					await applicationService.saveFile(applicationId, FileType.HALF_BODY, fileId.fileId)
					answers[question.id] = fileId.fileId
				}
				ctx.session.temp.photoFileId = fileId.fileId
				await applicationService.saveAnswer(applicationId, question.id, answers[question.id], AnswerFieldType.TEXT)
				continue
			}
			if (question.type === 'TEXT_OPTIONAL') {
				let value = ''
				try {
					value = await askText(conversation, ctx, `❓ *${escapeMarkdown(localizedQuestion(ctx, question))}*`, { cancel: true, skip: true })
				} catch (err) {
					if (isNavSignal(err) && err.message === 'SKIP') {
						value = getUserLang(ctx) === 'ru' ? 'Нет' : 'Yo‘q'
					} else {
						throw err
					}
				}
				answers[question.id] = value.trim()
				await applicationService.saveAnswer(applicationId, question.id, answers[question.id], AnswerFieldType.TEXT)
				continue
			}
			const prompt = question.id === 'full_name' && ctx.from
				? `👤 *${escapeMarkdown(localizedQuestion(ctx, question))}*\n\n${getUserLang(ctx) === 'ru' ? 'Имя в Telegram' : 'Telegramdagi ism'}: *${escapeMarkdown([ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' '))}*`
				: `❓ *${escapeMarkdown(localizedQuestion(ctx, question))}*`
			const value = await askText(conversation, ctx, prompt, { cancel: true })
			answers[question.id] = value.trim()
			if (question.id === 'full_name') ctx.session.temp.fullName = answers[question.id]
			await applicationService.saveAnswer(applicationId, question.id, answers[question.id], AnswerFieldType.TEXT)
		}

		const summary = [
			getUserLang(ctx) === 'ru' ? '📄 *Анкета готова*' : '📄 *Anketa tayyor*',
			'',
			`👤 *${getUserLang(ctx) === 'ru' ? 'ФИО' : 'F.I.Sh'}:* ${escapeMarkdown(answers.full_name || '')}`,
			`📞 *${getUserLang(ctx) === 'ru' ? 'Телефон' : 'Telefon'}:* ${escapeMarkdown(answers.phone_number || '')}`,
			`📌 *${getUserLang(ctx) === 'ru' ? 'Вакансия' : 'Vakansiya'}:* ${escapeMarkdown(vacancy.title)}`,
			`💰 *${getUserLang(ctx) === 'ru' ? 'Ожидаемая зарплата' : 'Kutilayotgan maosh'}:* ${escapeMarkdown(answers.salary_expectation || '-')}`,
			'',
			getUserLang(ctx) === 'ru' ? 'Подтверждаете отправку?' : 'Yuborishni tasdiqlaysizmi?'
		]
		const sent = await ctx.reply(summary.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: new InlineKeyboard().text(t(ctx, 'confirm'), 'CONFIRM|SUBMIT').text(t(ctx, 'cancel'), 'NAV|CANCEL')
		})
		ctx.session.lastBotMessageId = sent.message_id
		const confirmation = await conversation.waitFor('callback_query:data')
		const data = confirmation.callbackQuery.data
		await confirmation.answerCallbackQuery().catch(() => undefined)
		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data !== 'CONFIRM|SUBMIT') return

		await applicationService.submitApplication(applicationId)
		const headerLines = buildAdminApplicationHeader(ctx, applicationId, vacancy.title, answers)
		const detailsText = buildAdminApplicationDetails(ctx, answers)
		const adminKb = new InlineKeyboard()
			.text(t(ctx, 'approved'), `AD|APPROVE|${applicationId}`)
			.text(t(ctx, 'reviewing'), `AD|REVIEW|${applicationId}`)
			.row()
			.text(t(ctx, 'rejected'), `AD|REJECT|${applicationId}`)
		const adminIds = Array.from(new Set([process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2].map(v => Number(v || 0)).filter(Boolean)))
		for (const adminChatId of adminIds) {
			try {
				if (answers.photo) {
					await ctx.api.sendPhoto(adminChatId, answers.photo, {
						caption: headerLines.join('\n')
					})
					await ctx.api.sendMessage(adminChatId, detailsText || '-', {
						reply_markup: adminKb,
						link_preview_options: { is_disabled: true }
					})
				} else {
					await ctx.api.sendMessage(adminChatId, [...headerLines, '', detailsText || '-'].join('\n'), {
						reply_markup: adminKb,
						link_preview_options: { is_disabled: true }
					})
				}
			} catch (err) {
				logger.error({ err, adminChatId }, 'Failed to notify admin')
			}
		}

		await replaceBotMessage(
			ctx,
			getUserLang(ctx) === 'ru'
				? '✅ *Заявка успешно отправлена.*\n\nМы свяжемся с вами после рассмотрения.'
				: '✅ *Ariza muvaffaqiyatli topshirildi.*\n\nKo‘rib chiqilgach siz bilan bog‘lanamiz.',
			{ parse_mode: 'Markdown' }
		)

		ctx.session.applicationId = undefined
		ctx.session.temp = { answers: {}, language: ctx.session.temp?.language }
	} catch (err) {
		if (isNavSignal(err)) {
			if (ctx.session.applicationId) {
				const result = await handleNavSignal(ctx, ctx.session.applicationId, err.message as NavSignal)
				if (result === 'RETURN') return
			} else if (err.message === 'START') {
				await showStartMenu(ctx)
				return
			} else if (err.message === 'ADMIN') {
				throw err
			} else if (err.message === 'CANCEL') {
				await replaceBotMessage(ctx, getUserLang(ctx) === 'ru' ? '❌ *Заявка отменена.*' : '❌ *Ariza bekor qilindi.*', { parse_mode: 'Markdown' })
				return
			}
		}
		logger.error({ err, userId: ctx.from?.id }, 'applicationFlow failed')
		await replaceBotMessage(
			ctx,
			getUserLang(ctx) === 'ru'
				? 'Произошла ошибка. Нажмите /start и попробуйте снова.'
				: 'Xatolik yuz berdi. /start ni bosib qayta urinib ko‘ring.'
		)
	}
}
