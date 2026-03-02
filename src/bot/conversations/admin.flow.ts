import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'

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
		if (upd.message?.text?.trim()) return upd.message.text.trim()
		if (upd.message?.text === '/start' || upd.message?.text === '/admin') return null
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
		if (upd.message?.text === '/start' || upd.message?.text === '/admin') return null
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
		`📌 *${vacancy.title}*\n📝 ${vacancy.description ?? '-'}\n💰 ${vacancy.salaryFrom ?? 0} - ${vacancy.salaryTo ?? 0}\n⚡️ ${vacancy.isActive ? 'Faol' : 'Faol emas'}`,
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
		const salaryFromStr = await askText(conversation, ctx, '💰 Oylik dan:')
		const salaryToStr = await askText(conversation, ctx, '💰 Oylik gacha:')
		if (!salaryFromStr || !salaryToStr) return
		await prisma.vacancy.update({
			where: { id },
			data: {
				title,
				description,
				salaryFrom: Number(salaryFromStr.replace(/\D+/g, '')),
				salaryTo: Number(salaryToStr.replace(/\D+/g, ''))
			}
		})
		await ctx.reply('✅ Vakansiya yangilandi.')
	}
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
				{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' }
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
			if (action === 'A|VAC_ADD') {
				const title = await askText(conversation, ctx, '📌 *Vakansiya nomi*:')
				const description = await askText(conversation, ctx, '📝 *Vakansiya tavsifi*:')
				const salaryFromStr = await askText(conversation, ctx, '💰 *Oylik dan*:')
				const salaryToStr = await askText(conversation, ctx, '💰 *Oylik gacha*:')
				if (!title || !description || !salaryFromStr || !salaryToStr) continue
				await prisma.vacancy.create({
					data: {
						title,
						description,
						salaryFrom: Number(salaryFromStr.replace(/\D+/g, '')),
						salaryTo: Number(salaryToStr.replace(/\D+/g, '')),
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
		logger.error({ err }, 'Admin flow failed')
		await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
	}
}
