import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'

type AdminNavSignal = 'START' | 'ADMIN'

const adminNavError = (sig: AdminNavSignal) => new Error(sig)

function isAdminNavSignal(err: unknown): err is Error {
	return err instanceof Error && (err.message === 'START' || err.message === 'ADMIN')
}

const COURSE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'IELTS', 'TOEFL', 'OTHER'] as const
type CourseLevelValue = (typeof COURSE_LEVELS)[number]

function isCourseLevel(value: string): value is CourseLevelValue {
	return (COURSE_LEVELS as readonly string[]).includes(value)
}

function isAdmin(ctx: BotContext): boolean {
	const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
	const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
	const id = ctx.from?.id
	return Boolean(id && (id === admin1 || id === admin2))
}

async function askText(conversation: Conversation<BotContext>, ctx: BotContext, q: string) {
	await ctx.reply(q, { parse_mode: 'Markdown' })
	while (true) {
		const upd = await conversation.wait()
		const text = upd.message?.text?.trim()
		if (text === '/start') throw adminNavError('START')
		if (text === '/admin') throw adminNavError('ADMIN')
		if (text) return text
		await ctx.reply('Matn yuboring. Bekor qilish uchun /start yoki /admin bosing.')
	}
}

async function askChoice(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	q: string,
	btns: { text: string; data: string }[]
): Promise<string | null> {
	const kb = new InlineKeyboard()
	for (const b of btns) kb.text(b.text, b.data).row()
	kb.text('◀️ Orqaga', 'CANCEL')
	await ctx.reply(q, { parse_mode: 'Markdown', reply_markup: kb })
	while (true) {
		const upd = await conversation.wait()
		const text = upd.message?.text?.trim()
		if (text === '/start') throw adminNavError('START')
		if (text === '/admin') throw adminNavError('ADMIN')
		if (!upd.callbackQuery?.data) continue
		await upd.answerCallbackQuery().catch(() => undefined)
		if (upd.callbackQuery.data === 'CANCEL') return null
		return upd.callbackQuery.data
	}
}

async function manageCourses(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	const items = await prisma.course.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
	if (!items.length) {
		await ctx.reply('📭 *Kurslar yo‘q*', { parse_mode: 'Markdown' })
		return
	}
	const picked = await askChoice(
		conversation,
		ctx,
		'📚 *Kurslar ro‘yxati*\nBirini tanlang:',
		items.map((c: { id: string; title: string; isActive: boolean }) => ({ text: `${c.isActive ? '✅' : '⛔️'} ${c.title}`, data: `COURSE|${c.id}` }))
	)
	if (!picked?.startsWith('COURSE|')) return
	const id = picked.split('|')[1]
	const course = await prisma.course.findUnique({ where: { id } })
	if (!course) return

	const action = await askChoice(
		conversation,
		ctx,
		`🎓 *${course.title}*\n📊 Daraja: *${course.level}*\n📝 ${course.description ?? '-'}\n⚡️ ${course.isActive ? 'Faol' : 'Faol emas'}`,
		[
			{ text: '✏️ Edit', data: `COURSE_EDIT|${id}` },
			{ text: '🗑 O‘chirish', data: `COURSE_DEL|${id}` }
		]
	)
	if (!action) return
	if (action.startsWith('COURSE_DEL|')) {
		const conf = await askChoice(conversation, ctx, 'Rostdan ham o‘chirilsinmi?', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yo‘q', data: 'NO' }
		])
		if (conf === 'YES') {
			await prisma.course.delete({ where: { id } })
			await ctx.reply('✅ Kurs o‘chirildi.')
		}
		return
	}
	if (action.startsWith('COURSE_EDIT|')) {
		const title = await askText(conversation, ctx, `✏️ Yangi nom (hozirgi: *${course.title}*):`)
		if (!title) return
		const description = await askText(conversation, ctx, '📝 Yangi tavsif:')
		if (!description) return
		const level = await askChoice(
			conversation,
			ctx,
			'📊 Yangi daraja:',
			COURSE_LEVELS.map(l => ({ text: l, data: l }))
		)
		if (!level || !isCourseLevel(level)) return
		await prisma.course.update({ where: { id }, data: { title, description, level } })
		await ctx.reply('✅ Kurs yangilandi.')
	}
}

async function manageVacancies(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	const items = await prisma.vacancy.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })
	if (!items.length) {
		await ctx.reply('📭 *Vakansiyalar yo‘q*', { parse_mode: 'Markdown' })
		return
	}
	const picked = await askChoice(
		conversation,
		ctx,
		'📋 *Vakansiyalar ro‘yxati*\nBirini tanlang:',
		items.map((v: { id: string; title: string; isActive: boolean }) => ({ text: `${v.isActive ? '✅' : '⛔️'} ${v.title}`, data: `VAC|${v.id}` }))
	)
	if (!picked?.startsWith('VAC|')) return
	const id = picked.split('|')[1]
	const vacancy = await prisma.vacancy.findUnique({ where: { id } })
	if (!vacancy) return

	const action = await askChoice(
		conversation,
		ctx,
		`📌 *${vacancy.title}*\n📝 ${vacancy.description ?? '-'}\n💰 ${vacancy.salaryFrom ? `${vacancy.salaryFrom} so'mdan` : 'Kelishilgan'}\n⚡️ ${vacancy.isActive ? 'Faol' : 'Faol emas'}`,
		[
			{ text: '✏️ Edit', data: `VAC_EDIT|${id}` },
			{ text: '🗑 O‘chirish', data: `VAC_DEL|${id}` }
		]
	)
	if (!action) return
	if (action.startsWith('VAC_DEL|')) {
		const conf = await askChoice(conversation, ctx, 'Rostdan ham o‘chirilsinmi?', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yo‘q', data: 'NO' }
		])
		if (conf === 'YES') {
			await prisma.vacancy.delete({ where: { id } })
			await ctx.reply('✅ Vakansiya o‘chirildi.')
		}
		return
	}
	if (action.startsWith('VAC_EDIT|')) {
		const title = await askText(conversation, ctx, `✏️ Yangi nom (hozirgi: *${vacancy.title}*):`)
		if (!title) return
		const description = await askText(conversation, ctx, '📝 Yangi tavsif:')
		if (!description) return
		const salaryFromStr = await askText(conversation, ctx, "💰 Oylik (kamida):")
		const qText = await askText(
			conversation,
			ctx,
			"❓ Vakansiya uchun qo'shimcha savollarni kiriting (har qatorga bitta savol, ixtiyoriy)."
		)
		if (!salaryFromStr) return
		await prisma.vacancy.update({
			where: { id },
			data: {
				title,
				description,
				salaryFrom: Number(salaryFromStr.replace(/\D+/g, '')) || null,
				salaryTo: null,
				questions: qText
					.split('\n')
					.map(q => q.trim())
					.filter(Boolean)
			}
		})
		await ctx.reply('✅ Vakansiya yangilandi.')
	}
}

async function manageApplications(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	const vacancies = await prisma.vacancy.findMany({
		where: { isActive: true },
		orderBy: { createdAt: 'desc' }
	})

	if (!vacancies.length) {
		await ctx.reply('📭 *Faol vakansiyalar topilmadi*', { parse_mode: 'Markdown' })
		return
	}

	const pickedVacancy = await askChoice(
		conversation,
		ctx,
		'📨 *Qaysi vakansiya arizalarini ko‘rasiz?*',
		vacancies.map((v: { id: string; title: string }) => ({ text: v.title, data: `APP_VAC|${v.id}` }))
	)

	if (!pickedVacancy?.startsWith('APP_VAC|')) return
	const vacancyId = pickedVacancy.split('|')[1]

	const applications = await prisma.application.findMany({
		where: { vacancyId, status: 'SUBMITTED' },
		include: {
			answers: true,
			files: true,
			vacancy: true
		},
		orderBy: { submittedAt: 'desc' },
		take: 20
	})

	if (!applications.length) {
		await ctx.reply('📭 Bu vakansiya uchun yuborilgan arizalar yo‘q.')
		return
	}

	const pickedApp = await askChoice(
		conversation,
		ctx,
		'📋 *Arizalar ro‘yxati*',
		applications.map((app: { id: string; answers: Array<{ fieldKey: string; fieldValue: string }> }) => {
			const fullName = app.answers.find((a: { fieldKey: string }) => a.fieldKey === 'full_name')?.fieldValue ?? 'Nomaʼlum'
			return { text: `${fullName} (#${app.id.slice(0, 8)})`, data: `APP_VIEW|${app.id}` }
		})
	)

	if (!pickedApp?.startsWith('APP_VIEW|')) return
	const applicationId = pickedApp.split('|')[1]
	const application = applications.find((a: { id: string }) => a.id === applicationId)
	if (!application) return

	const map = new Map<string, string>(application.answers.map((a: { fieldKey: string; fieldValue: string }) => [a.fieldKey, a.fieldValue]))
	const photo = application.files.find((f: { type: string }) => f.type === 'HALF_BODY')

	const customAnswers = Array.from(map.entries())
		.filter(([key]) => key.startsWith('vacancy_q_'))
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, value], idx) => `• Savol ${idx + 1}: ${value}`)

	const text = [
		`📌 *Vakansiya:* ${application.vacancy?.title ?? '-'}`,
		'',
		'📌 *1. Shaxsiy maʼlumotlar*',
		`👤 ${map.get('full_name') ?? '-'}`,
		`📅 ${map.get('birth_date') ?? '-'}`,
		`📍 ${map.get('address') ?? '-'}`,
		`📞 ${map.get('phone') ?? '-'}`,
		`💍 ${map.get('marital_status') ?? '-'}`,
		'',
		'🎓 *2. Taʼlim*',
		`🏫 ${map.get('education_type') ?? '-'}`,
		`📚 ${map.get('speciality') ?? '-'}`,
		`📜 ${map.get('certificates') ?? '-'}`,
		'',
		'💼 *3. Tajriba*',
		`🏢 ${map.get('exp_company') ?? '-'}`,
		`⏳ ${map.get('exp_duration') ?? '-'}`,
		`👔 ${map.get('exp_position') ?? '-'}`,
		`❓ ${map.get('exp_leave_reason') ?? '-'}`,
		`🕒 ${map.get('exp_can_work_how_long') ?? '-'}`,
		`💻 ${map.get('computer_skills') ?? '-'}`,
		'',
		'🧍‍♀️ *4. Moslik*',
		`🗣️ ${map.get('communication_skill') ?? '-'}`,
		`📞 ${map.get('can_answer_calls') ?? '-'}`,
		`🤝 ${map.get('client_experience') ?? '-'}`,
		`👔 ${map.get('dress_code') ?? '-'}`,
		`💪 ${map.get('stress_tolerance') ?? '-'}`,
		'',
		'⏰ *5. Ish sharoiti*',
		`🕐 ${map.get('work_shift') ?? '-'}`,
		`💰 ${map.get('expected_salary') ?? '-'}`,
		`🚀 ${map.get('start_date') ?? '-'}`,
		'',
		customAnswers.length ? '📌 *Vakansiya savollari:*' : '',
		...customAnswers,
		'',
		`🔗 *Rasm:* ${photo?.cloudinaryUrl ?? 'Mavjud emas'}`
	].join('\n')

	const kb = new InlineKeyboard()
		.text('✅ Qabul qilish', `AD|APPROVE|${application.id}`)
		.text('❌ Rad etish', `AD|REJECT|${application.id}`)

	if (photo?.cloudinaryUrl) {
		await ctx.replyWithPhoto(photo.cloudinaryUrl, {
			caption: text,
			parse_mode: 'Markdown',
			reply_markup: kb
		})
		return
	}

	await ctx.reply(text, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
}

export async function adminFlow(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	if (!isAdmin(ctx)) {
		await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
		return
	}
	try {
		while (true) {
			const action = await askChoice(conversation, ctx, '*👨‍💼 Admin panel*', [
				{ text: '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
				{ text: '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
				{ text: '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
				{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' },
				{ text: '📨 Arizalar (vakansiya bo‘yicha)', data: 'A|APP_LIST' }
			])
			if (!action) return

			if (action === 'A|VAC_LIST') {
				await manageVacancies(conversation, ctx)
				continue
			}
			if (action === 'A|COURSE_LIST') {
				await manageCourses(conversation, ctx)
				continue
			}
			if (action === 'A|APP_LIST') {
				await manageApplications(conversation, ctx)
				continue
			}
			if (action === 'A|VAC_ADD') {
				const title = await askText(conversation, ctx, '📌 *Vakansiya nomi*:')
				const description = await askText(conversation, ctx, '📝 *Vakansiya tavsifi*:')
				const salaryFromStr = await askText(conversation, ctx, "💰 *Oylik (kamida)*:")
				const qText = await askText(
					conversation,
					ctx,
					"❓ *Vakansiya savollari* (har qatorga bitta savol, ixtiyoriy):"
				)
				if (!title || !description || !salaryFromStr) continue
				await prisma.vacancy.create({
					data: {
						title,
						description,
						salaryFrom: Number(salaryFromStr.replace(/\D+/g, '')) || null,
						salaryTo: null,
						questions: qText
							.split('\n')
							.map(q => q.trim())
							.filter(Boolean),
						isActive: true
					}
				})
				await ctx.reply('✅ Vakansiya yaratildi.')
				continue
			}
			if (action === 'A|COURSE_ADD') {
				const title = await askText(conversation, ctx, '🎓 *Kurs nomi*:')
				const description = await askText(conversation, ctx, '📝 *Kurs tavsifi*:')
				const level = await askChoice(
					conversation,
					ctx,
					'📊 *Daraja*:',
					COURSE_LEVELS.map(l => ({ text: l, data: l }))
				)
				if (!title || !description || !level || !isCourseLevel(level)) continue
				await prisma.course.create({ data: { title, description, level, isActive: true } })
				await ctx.reply('✅ Kurs yaratildi.')
			}
		}
	} catch (err) {
		if (isAdminNavSignal(err)) {
			if (err.message === 'START') {
				await ctx.conversation.exit()
				await ctx.conversation.enter('applicationFlow')
				return
			}

			if (err.message === 'ADMIN') {
				await ctx.reply('👨‍💼 Siz allaqachon admin panelsiz.')
				await ctx.conversation.exit()
				await ctx.conversation.enter('adminFlow')
				return
			}
		}

		logger.error({ err }, 'Admin flow failed')
		await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
	}
}
