import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'

type VacancyItem = Awaited<ReturnType<typeof prisma.vacancy.findMany>>[number]
type CourseItem = Awaited<ReturnType<typeof prisma.course.findMany>>[number]
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

async function checkForCancel(ctx: BotContext): Promise<boolean> {
	const message = ctx.message?.text
	if (
		message === '/start' ||
		message === '/admin' ||
		message === '◀️ Orqaga' ||
		message === '🔙 Orqaga'
	) {
		await ctx.reply('❌ Amal bekor qilindi.', { parse_mode: 'Markdown' })
		return true
	}
	return false
}

async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	q: string
): Promise<string | null> {
	await ctx.reply(q, { parse_mode: 'Markdown' })

	while (true) {
		const upd = await conversation.wait()
		const ctx = upd as BotContext

		// Check for cancel commands
		if (await checkForCancel(ctx)) {
			return null
		}

		const text = ctx.message?.text?.trim()
		if (text) return text

		await ctx.reply('Matn yuboring. Bekor qilish uchun /start yoki /admin bosing.')
	}
}

// async function askChoice(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext,
// 	q: string,
// 	btns: { text: string; data: string }[]
// ): Promise<string | null> {
// 	// Add back button to all choice menus
// 	const kb = new InlineKeyboard()
// 	for (const b of btns) kb.text(b.text, b.data).row()
// 	kb.text('◀️ Orqaga', 'CANCEL').row()

// 	await ctx.reply(q, { reply_markup: kb, parse_mode: 'Markdown' })

// 	while (true) {
// 		const upd = await conversation.wait()
// 		const ctx = upd as BotContext

// 		// Check for text commands
// 		if (await checkForCancel(ctx)) {
// 			return null
// 		}

// 		if (!ctx.callbackQuery?.data) continue

// 		// Handle cancel button
// 		if (ctx.callbackQuery.data === 'CANCEL') {
// 			await ctx.answerCallbackQuery()
// 			await ctx.reply('❌ Amal bekor qilindi.', { parse_mode: 'Markdown' })
// 			return null
// 		}

// 		await ctx.answerCallbackQuery()
// 		return ctx.callbackQuery.data
// 	}
// }

async function askChoice(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	q: string,
	btns: { text: string; data: string }[]
): Promise<string | null> {
	// Add back button to all choice menus
	const kb = new InlineKeyboard()

	// Tugmalarni 2 tadan qatorlarga ajratamiz
	for (let i = 0; i < btns.length; i += 2) {
		// Birinchi tugma
		kb.text(btns[i].text, btns[i].data)

		// Agar ikkinchi tugma mavjud bo'lsa
		if (i + 1 < btns.length) {
			kb.text(btns[i + 1].text, btns[i + 1].data)
		}

		// Yangi qator
		kb.row()
	}

	// Orqaga tugmasini alohida qatorga qo'shamiz
	kb.text('◀️ Orqaga', 'CANCEL').row()

	await ctx.reply(q, { reply_markup: kb, parse_mode: 'Markdown' })

	while (true) {
		const upd = await conversation.wait()
		const ctx = upd as BotContext

		// Check for text commands
		if (await checkForCancel(ctx)) {
			return null
		}

		if (!ctx.callbackQuery?.data) continue

		// Handle cancel button
		if (ctx.callbackQuery.data === 'CANCEL') {
			await ctx.answerCallbackQuery()
			await ctx.reply('❌ Amal bekor qilindi.', { parse_mode: 'Markdown' })
			return null
		}

		await ctx.answerCallbackQuery()
		return ctx.callbackQuery.data
	}
}

async function showAdminMenu(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<string | null> {
	return await askChoice(conversation, ctx, '*👨‍💼 Admin panel* — amalni tanlang:', [
		{ text: '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
		{ text: '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
		{ text: '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
		{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' }
	])
}

export async function adminFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	if (!isAdmin(ctx)) {
		await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
		return
	}

	try {
		while (true) {
			// Main menu with back button
			const action = await showAdminMenu(conversation, ctx)

			// If user cancelled
			if (!action) {
				continue // Show admin menu again
			}

			if (action === 'A|VAC_LIST') {
				const items = await prisma.vacancy.findMany({
					orderBy: { createdAt: 'desc' },
					take: 10 // Show only last 10
				})

				if (!items.length) {
					await ctx.reply(
						'📭 *Vakansiyalar roʻyxati*\n\nHozircha hech qanday vakansiya mavjud emas.',
						{
							parse_mode: 'Markdown'
						}
					)
					continue
				}

				let message = '*📋 Vakansiyalar roʻyxati*\n\n'
				items.forEach((v: VacancyItem, index: number) => {
					const status = v.isActive ? '✅' : '⛔️'
					const salary =
						v.salaryFrom && v.salaryTo
							? `💰 ${v.salaryFrom.toLocaleString()} - ${v.salaryTo.toLocaleString()} soʻm`
							: '💰 Kelishilgan'
					message += `${index + 1}. ${status} *${v.title}*\n`
					message += `   ${salary}\n`
					if (v.description) {
						message += `   📝 ${v.description.substring(0, 50)}${
							v.description.length > 50 ? '...' : ''
						}\n`
					}
					message += '\n'
				})
				message += '_Oxirgi 10 ta vakansiya koʻrsatilgan_'

				await ctx.reply(message, { parse_mode: 'Markdown' })
				continue
			}

			if (action === 'A|COURSE_LIST') {
				const items = await prisma.course.findMany({
					orderBy: { createdAt: 'desc' },
					take: 10 // Show only last 10
				})

				if (!items.length) {
					await ctx.reply('📭 *Kurslar roʻyxati*\n\nHozircha hech qanday kurs mavjud emas.', {
						parse_mode: 'Markdown'
					})
					continue
				}

				let message = '*📚 Kurslar roʻyxati*\n\n'
				items.forEach((c: CourseItem, index: number) => {
					const status = c.isActive ? '✅' : '⛔️'
					message += `${index + 1}. ${status} *${c.title}*\n`
					message += `   🎯 Daraja: ${c.level}\n`
					if (c.description) {
						message += `   📝 ${c.description.substring(0, 50)}${
							c.description.length > 50 ? '...' : ''
						}\n`
					}
					message += '\n'
				})
				message += '_Oxirgi 10 ta kurs koʻrsatilgan_'

				await ctx.reply(message, { parse_mode: 'Markdown' })
				continue
			}

			if (action === 'A|VAC_ADD') {
				const title = await askText(conversation, ctx, '📌 *Vakansiya nomi* (title):')
				if (!title) continue // User cancelled, show admin menu

				const description = await askText(
					conversation,
					ctx,
					'📝 *Vakansiya tavsifi* (description):'
				)
				if (!description) continue

				const salaryFromStr = await askText(
					conversation,
					ctx,
					'💰 *Oylik dan* (son). Masalan: `3000000`'
				)
				if (!salaryFromStr) continue

				const salaryToStr = await askText(
					conversation,
					ctx,
					'💰 *Oylik gacha* (son). Masalan: `6000000`'
				)
				if (!salaryToStr) continue

				const isActiveChoice = await askChoice(conversation, ctx, '⚡️ *Faol qilinsinmi?*', [
					{ text: '✅ Ha', data: 'YES' },
					{ text: '⛔️ Yo‘q', data: 'NO' }
				])
				if (!isActiveChoice) continue

				const isActive = isActiveChoice === 'YES'
				const salaryFrom = Number(String(salaryFromStr).replace(/\D+/g, '')) || 0
				const salaryTo = Number(String(salaryToStr).replace(/\D+/g, '')) || 0

				const v = await prisma.vacancy.create({
					data: {
						title: title.trim(),
						description: description.trim(),
						salaryFrom,
						salaryTo,
						isActive
					}
				})

				await ctx.reply(
					`✅ *Vakansiya muvaffaqiyatli yaratildi!*\n\n` +
						`📌 *Nomi:* ${v.title}\n` +
						`💰 *Maosh:* ${v.salaryFrom?.toLocaleString() || 0} - ${
							v.salaryTo?.toLocaleString() || 0
						} soʻm\n` +
						`⚡️ *Holat:* ${v.isActive ? '✅ Faol' : '⛔️ Faol emas'}`,
					{ parse_mode: 'Markdown' }
				)
				continue
			}

			if (action === 'A|COURSE_ADD') {
				const title = await askText(conversation, ctx, '🎓 *Kurs nomi* (title):')
				if (!title) continue

				const description = await askText(conversation, ctx, '📝 *Kurs tavsifi* (description):')
				if (!description) continue

				const levelChoice = await askChoice(conversation, ctx, '📊 *Daraja* (level):', [
					{ text: '🇺🇸 A1', data: 'A1' },
					{ text: '🇺🇸 A2', data: 'A2' },
					{ text: '🇬🇧 B1', data: 'B1' },
					{ text: '🇬🇧 B2', data: 'B2' },
					{ text: '🇬🇧 C1', data: 'C1' },
					{ text: '🇬🇧 C2', data: 'C2' },
					{ text: '🎯 IELTS', data: 'IELTS' },
					{ text: '🎯 TOEFL', data: 'TOEFL' },
					{ text: '📚 Boshqa', data: 'OTHER' }
				])
				if (!levelChoice || !isCourseLevel(levelChoice)) continue

				const isActiveChoice = await askChoice(conversation, ctx, '⚡️ *Faol qilinsinmi?*', [
					{ text: '✅ Ha', data: 'YES' },
					{ text: '⛔️ Yo‘q', data: 'NO' }
				])
				if (!isActiveChoice) continue

				const isActive = isActiveChoice === 'YES'

				const c = await prisma.course.create({
					data: {
						title: title.trim(),
						description: description.trim(),
						level: levelChoice,
						isActive
					}
				})

				await ctx.reply(
					`✅ *Kurs muvaffaqiyatli yaratildi!*\n\n` +
						`🎓 *Nomi:* ${c.title}\n` +
						`📊 *Daraja:* ${c.level}\n` +
						`⚡️ *Holat:* ${c.isActive ? '✅ Faol' : '⛔️ Faol emas'}`,
					{ parse_mode: 'Markdown' }
				)
				continue
			}
		}
	} catch (err) {
		logger.error({ err }, 'Admin flow failed')
		await ctx.reply('❌ Xatolik yuz berdi. Iltimos qaytadan urinib koʻring.')
	}
}
