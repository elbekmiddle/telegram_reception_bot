import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'
import type { FileType } from '@prisma/client'
type QuestionType = 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT'

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

const DEFAULT_RECEPTION_QUESTIONS: EffectiveQuestion[] = [
	{ id: 'full_name', question: 'Ism, familiya', type: 'TEXT' },
	{ id: 'birth_date', question: 'Tug‘ilgan sana (yosh)', type: 'TEXT' },
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
			'Qaysi til va fandan sertifikati bor ? ( , ingliz, arab, rus, nemis, koreys, turk, ona tili, matematika, fizika, kimyo, bialogiya, tarix, huquq va darajasi)',
		type: 'TEXT'
	},
	{ id: 'worked_before', question: 'Oldin qayerda ishlagan?', type: 'TEXT' },
	{ id: 'work_duration', question: 'qancha muddat ishalagan', type: 'TEXT' },
	{ id: 'position', question: 'Qaysi lavozimda ishlagan?', type: 'TEXT' },
	{ id: 'leave_reason', question: 'Ishdan ketish sababi', type: 'TEXT' },
	{ id: 'can_work_duration', question: 'biz bn qancha muddat ishlay oladi', type: 'TEXT' },
	{
		id: 'computer_skills',
		question: 'Kompyuterda ishlay oladimi? (Word, Excel, Telegram, CRM va boshqalar)',
		type: 'TEXT'
	},
	{ id: 'communication_skill', question: 'Muloqot qobiliyati qanday?', type: 'TEXT' },
	{
		id: 'phone_answering',
		question: 'Telefon qo‘ng‘iroqlariga javob bera oladimi?',
		type: 'TEXT'
	},
	{
		id: 'client_experience',
		question: 'Mijozlar bilan ishlash tajribasi bormi?',
		type: 'TEXT'
	},
	{
		id: 'appearance',
		question: 'Tashqi ko‘rinish va kiyinish madaniyatiga rioya qiladimi?',
		type: 'TEXT'
	},
	{ id: 'stress', question: 'Stressga chidamliligi qanday?', type: 'TEXT' },
	{
		id: 'work_schedule',
		question: 'Qaysi ish vaqtida ishlay oladi? (to‘liq stavka / yarim stavka)',
		type: 'TEXT'
	},
	{ id: 'salary_expectation', question: 'Oylik kutilmasi qancha?', type: 'TEXT' },
	{ id: 'start_work', question: 'Qachondan ish boshlay oladi?', type: 'TEXT' },
	{ id: 'photo', question: '3x4 rasm yuboring', type: 'TEXT' },
	{ id: 'recommendation', question: 'Tavsiyanoma bormi?', type: 'TEXT' }
]

function getFallbackQuestions(): EffectiveQuestion[] {
	return DEFAULT_RECEPTION_QUESTIONS
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
					caption: '📸 *Demo rasm*\n\nShunga o‘xshash rasm yuboring.',
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
			lines.push(`• *${escapeMarkdown(vacancy.title)}*${vacancy.salary ? ` — ${escapeMarkdown(vacancy.salary)}` : ''}`)
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
	if (vacancy.questions?.length) {
		return vacancy.questions.map((q: any) => ({
			id: q.id,
			question: q.question,
			type: q.type,
			options: q.options?.map((o: any) => ({ text: o.text, value: o.value }))
		}))
	}
	return getFallbackQuestions()
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
				"✨ *Assalomu alaykum\!*\n\nVakansiyani tanlang. Avval ma’lumot chiqadi, keyin ariza topshirasiz.",
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

		if (!ctx.session.temp.fullName) {
			const defaultName = [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ').trim()
			const nameQuestion = defaultName
				? `👤 *Ism, familiyangizni kiriting:*\n\nTelegramdagi ism: *${escapeMarkdown(defaultName)}*`
				: '👤 *Ism, familiyangizni kiriting:*'
			ctx.session.temp.fullName = (await askText(conversation, ctx, nameQuestion, { cancel: true })).trim()
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
		}

		if (!ctx.session.temp.photoFileId) {
			await sendDemoPhoto(ctx)
			const photoFileId = await askPhoto(
				conversation,
				ctx,
				"📸 *3x4 rasm yuboring*\n\nDemo xabardan keyin shu yerga rasmni jo‘nating."
			)
			ctx.session.temp.photoFileId = photoFileId

			try {
				const validated = await photoService.validateTelegramPhoto(ctx, photoFileId, {
					minWidth: 1,
					minHeight: 1,
					minRatio: 0,
					maxRatio: 10
				})

				if (validated.ok) {
					const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)
					await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId, {
						cloudinaryUrl: uploaded.secureUrl,
						cloudinaryPublicId: uploaded.publicId,
						meta: { faces: uploaded.faces }
					})
					ctx.session.temp.photoUrl = uploaded.secureUrl
				} else {
					await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId)
				}
			} catch (uploadErr) {
				logger.warn({ err: uploadErr, applicationId }, 'Cloudinary upload failed, saving telegram file id only')
				await applicationService.saveFile(applicationId, 'HALF_BODY' as FileType, photoFileId)
			}

			await replaceBotMessage(ctx, '✅ Rasm qabul qilindi!')
		}

		ctx.session.temp.vacancyAnswers ??= {}
		for (const question of effectiveQuestions) {
			const questionKey = `q_${question.id}`
			if (ctx.session.temp.vacancyAnswers[questionKey]) continue
			if (question.id === 'full_name') {
				ctx.session.temp.vacancyAnswers[questionKey] = ctx.session.temp.fullName
				continue
			}
			if (question.id === 'phone_number') {
				ctx.session.temp.vacancyAnswers[questionKey] = ctx.session.temp.phone
				continue
			}
			if (question.id === 'photo') {
				ctx.session.temp.vacancyAnswers[questionKey] = ctx.session.temp.photoUrl || ctx.session.temp.photoFileId
				continue
			}

			if (question.type === 'TEXT') {
				ctx.session.temp.vacancyAnswers[questionKey] = await askText(
					conversation,
					ctx,
					`❓ *${escapeMarkdown(question.question)}*`,
					{ cancel: true }
				)
				continue
			}

			if (question.type === 'SINGLE_SELECT' && question.options?.length) {
				const answer = await askInline(
					conversation,
					ctx,
					`❓ *${escapeMarkdown(question.question)}*`,
					question.options.map(opt => ({ text: opt.text, data: opt.value })),
					{ cancel: true, columns: 2 }
				)
				ctx.session.temp.vacancyAnswers[questionKey] = answer
				continue
			}

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
			}
		}

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

		const sentMsg = await ctx.reply(summary.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: new InlineKeyboard()
				.text('✅ Tasdiqlash', 'CONFIRM|SUBMIT')
				.text('❌ Bekor qilish', 'NAV|CANCEL')
		})
		ctx.session.lastBotMessageId = sentMsg.message_id

		const confirmation = await conversation.waitFor('callback_query:data')
		const data = confirmation.callbackQuery?.data
		await confirmation.answerCallbackQuery().catch(() => {})

		if (data === 'NAV|CANCEL') throw navError('CANCEL')
		if (data !== 'CONFIRM|SUBMIT') return

		await applicationService.saveAnswer(applicationId, 'full_name', ctx.session.temp.fullName, 'TEXT' as any)
		await applicationService.saveAnswer(applicationId, 'phone', ctx.session.temp.phone, 'PHONE' as any)

		for (const [key, value] of Object.entries(ctx.session.temp.vacancyAnswers)) {
			await applicationService.saveAnswer(applicationId, key, String(value), 'TEXT' as any)
		}

		await applicationService.submitApplication(applicationId)

		const adminChatIds = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
			.map(v => Number(v || 0))
			.filter(Boolean)

		const adminMessage = [
			`🆕 *Yangi ariza #${escapeMarkdown(applicationId.slice(0, 8))}*`,
			'',
			`👤 Ism: ${escapeMarkdown(ctx.session.temp.fullName || '')}`,
			`📞 Telefon: ${escapeMarkdown(ctx.session.temp.phone || '')}`,
			`📌 Vakansiya: ${escapeMarkdown(vacancy.title || '')}`,
			ctx.session.temp.photoUrl ? `🖼 Rasm linki: ${escapeMarkdown(ctx.session.temp.photoUrl)}` : '',
			''
		]

		for (const question of effectiveQuestions) {
			const answer = ctx.session.temp.vacancyAnswers[`q_${question.id}`]
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
			} catch (err) {
				logger.error({ err, adminChatId }, 'Failed to notify admin')
			}
		}

		await ctx.reply(
			'✅ *Anketa topshirildi!*\n\nSizning arizangiz qabul qilindi. Admin tez orada bog‘lanadi.',
			{ parse_mode: 'Markdown' }
		)

		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		await ctx.conversation.exit()
	} catch (err) {
		if (isNavSignal(err) && ctx.session.applicationId) {
			const result = await handleNavSignal(ctx, ctx.session.applicationId, err.message as NavSignal)
			if (result === 'RETURN') return
		}

		logger.error({ err, userId: ctx.from?.id }, 'applicationFlow failed')
		await replaceBotMessage(ctx, "Xatolik yuz berdi. /start bilan qayta urinib ko‘ring.")
	}
}
