import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { userService } from '../../services/user.service'
import { logger } from '../../utils/logger'
import { showStartMenu } from '../start.menu'

async function deletePrev(ctx: BotContext) {
	const msgId = ctx.session.lastBotMessageId
	const chatId = ctx.chat?.id
	if (!msgId || !chatId) return
	try {
		await ctx.api.deleteMessage(chatId, msgId)
	} catch {}
}

async function replaceBotMessage(
	ctx: BotContext,
	text: string,
	options?: Parameters<BotContext['reply']>[1]
) {
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
			await upd.answerCallbackQuery({
				text: 'Bu tugmalar eskirgan. Pastdagi yangi tugmalardan foydalaning.',
				show_alert: false
			}).catch(() => undefined)
			continue
		}
		await upd.answerCallbackQuery().catch(() => undefined)
		return upd.callbackQuery.data
	}
}

async function askText(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	q: string
): Promise<string> {
	await replaceBotMessage(ctx, q, { parse_mode: 'Markdown' })
	while (true) {
		const upd = await conversation.wait()
		const text = upd.message?.text?.trim()
		if (text === '/start') {
			await showStartMenu(ctx)
			return ''
		}
		if (text) return text
	}
}

async function askPhone(conversation: Conversation<BotContext>, ctx: BotContext): Promise<string> {
	const kb = new Keyboard().requestContact('📱 Telefon raqamni yuborish').resized().oneTime()
	await replaceBotMessage(ctx, '📞 *Telefon raqamingizni yuboring*', {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
	while (true) {
		const upd = await conversation.wait()
		if (upd.message?.contact?.phone_number) return upd.message.contact.phone_number
		const t = upd.message?.text?.trim()
		if (t) return t
	}
}

async function askCourseAction(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	course: { id: string; title: string; description: string | null; price: string | null; imageUrl?: string | null }
): Promise<string> {
	const detail = [
		`🎓 *${course.title}*`,
		'',
		course.description ? `📝 ${course.description}` : '📝 Ma’lumot yo‘q',
		`💰 Narxi: *${course.price ?? '-'}*`
	].join('\n')
	const kb = new InlineKeyboard()
		.text('✅ Kursga yozilish', `ENROLL|${course.id}`)
		.row()
		.text('⬅️ Orqaga', 'NAV|BACK')

	await deletePrev(ctx)
	let promptMessageId: number | undefined
	if (course.imageUrl) {
		const sent = await ctx.replyWithPhoto(course.imageUrl, {
			caption: detail,
			parse_mode: 'Markdown',
			reply_markup: kb
		})
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
			await upd.answerCallbackQuery({
				text: 'Bu tugmalar eskirgan. Pastdagi yangi tugmalardan foydalaning.',
				show_alert: false
			}).catch(() => undefined)
			continue
		}
		await upd.answerCallbackQuery().catch(() => undefined)
		return upd.callbackQuery.data
	}
}

async function pickCourse(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<string | null> {
	const perPage = 5
	let page = 0

	while (true) {
		const total = await conversation.external(() =>
			prisma.course.count({ where: { isActive: true } })
		)
		if (!total) return null
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

		const picked = await askInline(
			conversation,
			ctx,
			`📚 *Kurslar ro‘yxati*\n\nSahifa: *${page + 1}/${totalPages}*\nBirini tanlang:`,
			buttons
		)

		if (picked === 'NAV|BACK') return null
		if (picked === 'PAGE|PREV') {
			page--
			continue
		}
		if (picked === 'PAGE|NEXT') {
			page++
			continue
		}
		if (picked.startsWith('COURSE|')) return picked.split('|')[1]
	}
}

export async function courseFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	try {
		const user = await userService.upsertFromCtx(ctx)
		if (!user) return

		while (true) {
			const courseId = await pickCourse(conversation, ctx)
			if (!courseId) {
				await showStartMenu(ctx)
				return
			}

			const course = await conversation.external(() =>
				prisma.course.findUnique({ where: { id: courseId } })
			)
			if (!course) continue

			const act = await askCourseAction(conversation, ctx, course)
			if (act === 'NAV|BACK') continue
			if (!act.startsWith('ENROLL|')) continue

			const fullName = await askText(conversation, ctx, '👤 *Ism, familiya:*')
			if (!fullName) return
			const phone = await askPhone(conversation, ctx)

			const days = await askInline(conversation, ctx, '📅 *Qaysi kunlari kelasiz?*', [
				{ text: 'Dushanba / Chorshanba', data: 'DAYS|MON_WED' },
				{ text: 'Seshanba / Payshanba', data: 'DAYS|TUE_THU' },
				{ text: 'Shanba / Yakshanba', data: 'DAYS|SAT_SUN' },
				{ text: '⬅️ Orqaga', data: 'NAV|BACK' }
			])
			if (days === 'NAV|BACK') continue

			const time = await askInline(conversation, ctx, '⏰ *Qaysi vaqtda?*', [
				{ text: '09:00 - 11:00', data: 'TIME|9_11' },
				{ text: '14:00 - 16:00', data: 'TIME|2_4' },
				{ text: '16:00 - 18:00', data: 'TIME|4_6' },
				{ text: '⬅️ Orqaga', data: 'NAV|BACK' }
			])
			if (time === 'NAV|BACK') continue

			const dayCode = days.replace('DAYS|', '')
			const timeCode = time.replace('TIME|', '')
			const adminIds = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
				.map(x => Number(x || 0))
				.filter(Boolean)

			await conversation.external(async () => {
				const duplicate = await prisma.courseEnrollment.findFirst({
					where: {
						courseId,
						userId: user.id,
						fullName,
						phone,
						createdAt: {
							gte: new Date(Date.now() - 5 * 60 * 1000)
						}
					},
					orderBy: { createdAt: 'desc' }
				})

				const enrollment = duplicate
					? duplicate
					: await prisma.courseEnrollment.create({
						data: {
							courseId,
							userId: user.id,
							fullName,
							phone,
							answers: {
								days: dayCode,
								timeSlot: timeCode
							}
						}
					})

				if (duplicate) return

				const kb = new InlineKeyboard()
					.text('✅ Qabul qilish', `CE|APPROVE|${enrollment.id}`)
					.text('❌ Rad etish', `CE|REJECT|${enrollment.id}`)

				const dayLabelMap: Record<string, string> = {
					MON_WED: 'Dushanba / Chorshanba',
					TUE_THU: 'Seshanba / Payshanba',
					SAT_SUN: 'Shanba / Yakshanba'
				}
				const timeLabelMap: Record<string, string> = {
					'9_11': '09:00 - 11:00',
					'2_4': '14:00 - 16:00',
					'4_6': '16:00 - 18:00'
				}

				for (const adminId of adminIds) {
					try {
						await ctx.api.sendMessage(
							adminId,
							[
								`🆕 *Kursga yozilish*`,
								`🎓 Kurs: *${course.title}*`,
								`👤 F\.I\.Sh: ${fullName}`,
								`📞 Telefon: ${phone}`,
								`📅 Kunlar: ${dayLabelMap[dayCode] || dayCode}`,
								`⏰ Vaqt: ${timeLabelMap[timeCode] || timeCode}`
							].join('\n'),
							{ parse_mode: 'Markdown', reply_markup: kb }
						)
					} catch (err) {
						logger.error({ err, adminId }, 'Failed to notify admin about course enrollment')
					}
				}
			})

			await replaceBotMessage(ctx, '✅ *So‘rov yuborildi!*\n\nAdminlar tez orada bog‘lanadi.', {
				parse_mode: 'Markdown'
			})
			return
		}
	} catch (error) {
		logger.error({ error, userId: ctx.from?.id }, 'Course flow failed')
		await replaceBotMessage(
			ctx,
			'❌ Xatolik yuz berdi. Faqat shu bo‘lim bekor qilindi, /start orqali davom etishingiz mumkin.',
			{ parse_mode: 'Markdown' }
		).catch(() => undefined)
	}
}
