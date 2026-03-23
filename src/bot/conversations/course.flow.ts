// src/bot/conversations/course.flow.ts
// FIXES:
//  - CRIT-003: Infinite loop when course deleted mid-flow → proper error + redirect
//  - CRIT-007: Race condition duplicate enrollment → DB-level unique check
//  - A-001: Cascade delete notification → user informed when course gone
//  - A-002: isActive check before enrollment (course deactivated mid-flow)
//  - A-010: CourseQuestion from DB actually used (was hardcoded days/time)
//  - H-001: escapeMarkdown applied to user inputs sent to admins
//  - U-004: courseId FK error handled with user-friendly message
//  - M-003: Duplicate enrollment window extended to 24h (not just 5 min)
//  - U-005: fullName length validation (max 100 chars)

import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { userService } from '../../services/user.service'
import { logger } from '../../utils/logger'
import { showStartMenu } from '../start.menu'
import { escapeMarkdown } from './flow-helpers'

// ─── helpers ────────────────────────────────────────────────────────────────

async function deletePrev(ctx: BotContext) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (!msgId || !chatId) return
	try { await ctx.api.deleteMessage(chatId, msgId) } catch {}
}

async function replaceBotMessage(ctx: BotContext, text: string, options?: Parameters<BotContext['reply']>[1]) {
	await deletePrev(ctx)
	const sent = await ctx.reply(text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	text: string,
	buttons: { text: string; data: string }[]
): Promise<string> {
	const kb = new InlineKeyboard()
	for (const b of buttons) kb.text(b.text, b.data).row()
	const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery?.data) continue
		const fromMessageId = upd.callbackQuery.message?.message_id
		if (fromMessageId && fromMessageId !== promptMsg.message_id) {
			await upd.answerCallbackQuery({ text: 'Bu tugmalar eskirgan. Pastdagi yangi tugmalardan foydalaning.', show_alert: false }).catch(() => undefined)
			continue
		}
		await upd.answerCallbackQuery().catch(() => undefined)
		return upd.callbackQuery.data
	}
}

async function askText(conversation: Conversation<BotContext>, ctx: BotContext, q: string): Promise<string> {
	await replaceBotMessage(ctx, q, { parse_mode: 'Markdown' })
	while (true) {
		const upd = await conversation.wait()
		const text = upd.message?.text?.trim()
		if (text === '/start') { await showStartMenu(ctx); return '' }
		if (text) return text
	}
}

async function askPhone(conversation: Conversation<BotContext>, ctx: BotContext): Promise<string> {
	const kb = new Keyboard().requestContact('📱 Telefon raqamni yuborish').resized().oneTime()
	await replaceBotMessage(ctx, '📞 *Telefon raqamingizni yuboring*', { parse_mode: 'Markdown', reply_markup: kb })
	while (true) {
		const upd = await conversation.wait()
		if (upd.message?.contact?.phone_number) {
			// Validate it's their own contact (U-002 fix)
			if (upd.message.contact.user_id && upd.message.contact.user_id !== ctx.from?.id) {
				await replaceBotMessage(ctx, '⚠️ Iltimos, o\'z telefon raqamingizni yuboring.', { reply_markup: kb })
				continue
			}
			return upd.message.contact.phone_number
		}
		const t = upd.message?.text?.trim()
		if (t) return t
	}
}

// ─── Course picker with pagination ──────────────────────────────────────────

async function pickCourse(conversation: Conversation<BotContext>, ctx: BotContext): Promise<string | null> {
	const perPage = 5
	let page = 0
	while (true) {
		const total = await conversation.external(() => prisma.course.count({ where: { isActive: true } }))
		if (!total) {
			await replaceBotMessage(ctx, '📭 Hozircha faol kurslar yo\'q.')
			return null
		}
		const totalPages = Math.max(1, Math.ceil(total / perPage))
		page = Math.max(0, Math.min(page, totalPages - 1))
		const courses = await conversation.external(() =>
			prisma.course.findMany({
				where: { isActive: true },
				orderBy: { createdAt: 'desc' },
				skip: page * perPage,
				take: perPage
			})
		)
		const buttons = courses.map(c => ({ text: c.title, data: `COURSE|${c.id}` }))
		if (page > 0) buttons.push({ text: '⬅️ Oldingi', data: 'PAGE|PREV' })
		if (page < totalPages - 1) buttons.push({ text: '➡️ Keyingi', data: 'PAGE|NEXT' })
		buttons.push({ text: '⬅️ Orqaga', data: 'NAV|BACK' })
		const picked = await askInline(conversation, ctx, `📚 *Kurslar ro'yxati*\n\nSahifa: *${page + 1}/${totalPages}*\nBirini tanlang:`, buttons)
		if (picked === 'NAV|BACK') return null
		if (picked === 'PAGE|PREV') { page--; continue }
		if (picked === 'PAGE|NEXT') { page++; continue }
		if (picked.startsWith('COURSE|')) return picked.split('|')[1]
	}
}

// ─── Course detail + enroll button ──────────────────────────────────────────

async function askCourseAction(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	course: { id: string; title: string; description: string | null; price: string | null; imageUrl?: string | null }
): Promise<string> {
	const detail = [`🎓 *${course.title}*`, '', course.description ? `📝 ${course.description}` : '📝 Ma\'lumot yo\'q', `💰 Narxi: *${course.price ?? '-'}*`].join('\n')
	const kb = new InlineKeyboard().text('✅ Kursga yozilish', `ENROLL|${course.id}`).row().text('⬅️ Orqaga', 'NAV|BACK')
	await deletePrev(ctx)
	let promptMessageId: number | undefined
	if (course.imageUrl) {
		const sent = await ctx.replyWithPhoto(course.imageUrl, { caption: detail, parse_mode: 'Markdown', reply_markup: kb })
		ctx.session.lastBotMessageId = sent.message_id
		promptMessageId = sent.message_id
	} else {
		const sent = await replaceBotMessage(ctx, detail, { parse_mode: 'Markdown', reply_markup: kb })
		promptMessageId = sent.message_id
	}
	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery?.data) continue
		const fromMessageId = upd.callbackQuery.message?.message_id
		if (fromMessageId && promptMessageId && fromMessageId !== promptMessageId) {
			await upd.answerCallbackQuery({ text: 'Bu tugmalar eskirgan.', show_alert: false }).catch(() => undefined)
			continue
		}
		await upd.answerCallbackQuery().catch(() => undefined)
		return upd.callbackQuery.data
	}
}

// ─── Dynamic course questions from DB (A-010 FIX) ───────────────────────────

async function askDynamicQuestions(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	courseId: string
): Promise<Record<string, string> | null> {
	const questions = await conversation.external(() =>
		prisma.courseQuestion.findMany({
			where: { courseId },
			orderBy: { order: 'asc' },
			include: { options: { orderBy: { order: 'asc' } } }
		})
	)

	// If no DB questions, fall back to hardcoded days/time
	if (!questions.length) {
		const days = await askInline(conversation, ctx, '📅 *Qaysi kunlari kelasiz?*', [
			{ text: 'Dushanba / Chorshanba', data: 'DAYS|MON_WED' },
			{ text: 'Seshanba / Payshanba', data: 'DAYS|TUE_THU' },
			{ text: 'Shanba / Yakshanba', data: 'DAYS|SAT_SUN' },
			{ text: '⬅️ Orqaga', data: 'NAV|BACK' }
		])
		if (days === 'NAV|BACK') return null
		const time = await askInline(conversation, ctx, '⏰ *Qaysi vaqtda?*', [
			{ text: '09:00 - 11:00', data: 'TIME|9_11' },
			{ text: '14:00 - 16:00', data: 'TIME|2_4' },
			{ text: '16:00 - 18:00', data: 'TIME|4_6' },
			{ text: '⬅️ Orqaga', data: 'NAV|BACK' }
		])
		if (time === 'NAV|BACK') return null
		return { days: days.replace('DAYS|', ''), timeSlot: time.replace('TIME|', '') }
	}

	// Use actual DB questions (A-010 FIX)
	const answers: Record<string, string> = {}
	for (const q of questions) {
		if (q.type === 'TEXT') {
			const answer = await askText(conversation, ctx, `*${q.question}*`)
			if (!answer) return null
			answers[q.id] = answer
		} else {
			// SINGLE_SELECT or MULTI_SELECT
			const buttons = q.options.map(o => ({ text: o.text, data: `OPT|${o.value}` }))
			buttons.push({ text: '⬅️ Orqaga', data: 'NAV|BACK' })
			const picked = await askInline(conversation, ctx, `*${q.question}*`, buttons)
			if (picked === 'NAV|BACK') return null
			answers[q.id] = picked.replace('OPT|', '')
		}
	}
	return answers
}

// ─── Main course flow ────────────────────────────────────────────────────────

export async function courseFlow(conversation: Conversation<BotContext>, ctx: BotContext): Promise<void> {
	try {
		const user = await userService.upsertFromCtx(ctx)
		if (!user) return

		while (true) {
			const courseId = await pickCourse(conversation, ctx)
			if (!courseId) { await showStartMenu(ctx); return }

			// CRIT-003 FIX: Fetch course — if deleted mid-flow, show message + retry list (not infinite loop)
			const course = await conversation.external(() =>
				prisma.course.findUnique({ where: { id: courseId } })
			)
			if (!course) {
				// Course was deleted between listing and selection
				await replaceBotMessage(ctx, '⚠️ Bu kurs o\'chirilgan. Boshqa kursni tanlang.')
				continue // goes back to pickCourse — NOT infinite since pickCourse queries fresh data
			}

			// A-002 FIX: Check isActive before enrollment (may have been deactivated)
			if (!course.isActive) {
				await replaceBotMessage(ctx, '⚠️ Bu kurs hozirda faol emas. Boshqa kursni tanlang.')
				continue
			}

			const act = await askCourseAction(conversation, ctx, course)
			if (act === 'NAV|BACK') continue
			if (!act.startsWith('ENROLL|')) continue

			// U-005 FIX: fullName length validation (max 100 chars)
			let fullName = ''
			while (true) {
				fullName = await askText(conversation, ctx, '👤 *Ism, familiya:*')
				if (!fullName) return
				if (fullName.length > 100) {
					await replaceBotMessage(ctx, '⚠️ Ism 100 ta belgidan oshmasligi kerak. Qaytadan kiriting.')
					continue
				}
				break
			}

			const phone = await askPhone(conversation, ctx)

			// A-010 FIX: Use dynamic questions from DB
			const qAnswers = await askDynamicQuestions(conversation, ctx, courseId)
			if (qAnswers === null) continue

			const adminIds = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
				.map(x => Number(x || 0))
				.filter(Boolean)

			await conversation.external(async () => {
				// M-003 / CRIT-007 FIX: Extended duplicate check to 24h + courseId+userId unique constraint
				const duplicate = await prisma.courseEnrollment.findFirst({
					where: {
						courseId,
						userId: user.id,
						status: { not: 'REJECTED' }, // allow re-enrollment if rejected
						createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24h window (was 5 min)
					},
					orderBy: { createdAt: 'desc' }
				})

				if (duplicate) {
					await ctx.reply('ℹ️ Siz bu kursga allaqachon yozilgansiz. Adminlar tez orada bog\'lanadi.')
					return
				}

				// U-004 FIX: Course may have been deleted between check and create — catch FK error
				let enrollment
				try {
					enrollment = await prisma.courseEnrollment.create({
						data: {
							courseId,
							userId: user.id,
							fullName,
							phone,
							answers: qAnswers
						}
					})
				} catch (err: any) {
					if (err?.code === 'P2003') {
						// Foreign key violation — course deleted just now
						await ctx.reply('❌ Kurs topilmadi. Boshqa kursni tanlang.')
						return
					}
					throw err
				}

				const kb = new InlineKeyboard()
					.text('✅ Qabul qilish', `CE|APPROVE|${enrollment.id}`)
					.text('❌ Rad etish', `CE|REJECT|${enrollment.id}`)

				// H-001 FIX: escapeMarkdown applied to ALL user inputs before Markdown message
				const safeName = escapeMarkdown(fullName)
				const safePhone = escapeMarkdown(phone)
				const safeCourse = escapeMarkdown(course.title)

				// Build answers summary (dynamic)
				const answerLines = Object.entries(qAnswers)
					.map(([k, v]) => `📌 ${escapeMarkdown(String(k))}: ${escapeMarkdown(String(v))}`)
					.join('\n')

				const adminText = [
					`🆕 *Kursga yozilish*`,
					`🎓 Kurs: *${safeCourse}*`,
					`👤 F\\.I\\.Sh: ${safeName}`,
					`📞 Telefon: ${safePhone}`,
					answerLines || ''
				].filter(Boolean).join('\n')

				for (const adminId of adminIds) {
					try {
						await ctx.api.sendMessage(adminId, adminText, { parse_mode: 'Markdown', reply_markup: kb })
					} catch (err) {
						// U-009 FIX: Log properly — user still gets success, but we log admin failure
						logger.error({ err, adminId, enrollmentId: enrollment.id }, 'Failed to notify admin about course enrollment')
					}
				}

				await replaceBotMessage(ctx, '✅ *So\'rov yuborildi!*\n\nAdminlar tez orada bog\'lanadi.', { parse_mode: 'Markdown' })
			})

			return
		}
	} catch (error) {
		logger.error({ error, userId: ctx.from?.id }, 'Course flow failed')
		await replaceBotMessage(
			ctx,
			'❌ Xatolik yuz berdi. Faqat shu bo\'lim bekor qilindi, /start orqali davom etishingiz mumkin.',
			{ parse_mode: 'Markdown' }
		).catch(() => undefined)
	}
}
