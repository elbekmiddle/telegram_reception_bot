import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, Keyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { userService } from '../../services/user.service'
import { logger } from '../../utils/logger'

async function deletePrev(ctx: BotContext) {
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
	await deletePrev(ctx)
	const sent = await ctx.reply(text, options)
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

async function askInline(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	text: string,
	buttons: { text: string; data: string }[],
	back = false
): Promise<string> {
	const kb = new InlineKeyboard()
	for (const b of buttons) kb.text(b.text, b.data).row()
	if (back) kb.text('⬅️ Orqaga', 'NAV|BACK')

	await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
	while (true) {
		const upd = await conversation.wait()
		if (!upd.callbackQuery?.data) continue
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
			await ctx.conversation?.enter('startFlow')
			return ''
		}
		if (text) return text
	}
}

async function askPhone(conversation: Conversation<BotContext>, ctx: BotContext): Promise<string> {
	const kb = new Keyboard().requestContact('📱 Telefon raqamni yuborish').resized().oneTime()
	await replaceBotMessage(ctx, '📞 *Telefon raqamingizni yuboring* (contact orqali):', {
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

export async function courseFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const user = await userService.upsertFromCtx(ctx)
	if (!user) return

	while (true) {
		const courses = await prisma.course.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' }
		})
		if (!courses.length) {
			await replaceBotMessage(ctx, '📭 *Hozircha kurslar yo‘q.*\n\n⬅️ /start bosib qayting.', {
				parse_mode: 'Markdown'
			})
			return
		}

		const picked = await askInline(
			conversation,
			ctx,
			'📚 *Kurslar ro‘yxati*\n\nBirini tanlang:',
			courses
				.slice(0, 12)
				.map(c => ({ text: c.title, data: `COURSE|${c.id}` }))
				.concat([{ text: '⬅️ Orqaga', data: 'NAV|BACK' }])
		)
		if (picked === 'NAV|BACK') {
			await ctx.conversation?.enter('startFlow')
			return
		}
		if (!picked.startsWith('COURSE|')) continue
		const courseId = picked.split('|')[1]
		const course = await prisma.course.findUnique({ where: { id: courseId } })
		if (!course) continue

		const detail = [
			`🎓 *${course.title}*`,
			'',
			course.description ? `📝 ${course.description}` : '📝 -',
			`💰 Narxi: *${course.price ?? 0}*`
			// hasCertificate maydoni yo'q, shuning uchun olib tashlaymiz
		].join('\n')

		const act = await askInline(conversation, ctx, detail, [
			{ text: '✅ Kursga yozilish', data: `ENROLL|${courseId}` },
			{ text: '⬅️ Orqaga', data: 'NAV|BACK' }
		])
		if (act === 'NAV|BACK') continue
		if (!act.startsWith('ENROLL|')) continue

		// Enrollment flow
		const fullName = await askText(conversation, ctx, '👤 *Ism, familiya:*')
		if (!fullName) return
		const phone = await askPhone(conversation, ctx)

		const days = await askInline(
			conversation,
			ctx,
			'📅 *Qaysi kunlari kelasiz?*',
			[
				{ text: 'Dushanba / Chorshanba', data: 'DAYS|MON_WED' },
				{ text: 'Seshanba / Payshanba', data: 'DAYS|TUE_THU' },
				{ text: 'Shanba / Yakshanba', data: 'DAYS|SAT_SUN' }
			],
			true
		)
		if (days === 'NAV|BACK') continue

		const time = await askInline(
			conversation,
			ctx,
			'⏰ *Qaysi vaqtda?*',
			[
				{ text: '09:00 - 11:00', data: 'TIME|9_11' },
				{ text: '14:00 - 16:00', data: 'TIME|2_4' },
				{ text: '16:00 - 18:00', data: 'TIME|4_6' }
			],
			true
		)
		if (time === 'NAV|BACK') continue

		// Sertifikat so'rovi (agar kerak bo'lsa)
		let wantCert = false
		// Agar kursda sertifikat maydoni bo'lsa, uni tekshirish mumkin
		// Lekin schema'da hasCertificate yo'q, shuning uchun har doim so'raymiz
		const cert = await askInline(
			conversation,
			ctx,
			'📄 *Sertifikat kerakmi?*',
			[
				{ text: '✅ Ha', data: 'CERT|YES' },
				{ text: '❌ Yo‘q', data: 'CERT|NO' }
			],
			true
		)
		if (cert === 'NAV|BACK') continue
		wantCert = cert === 'CERT|YES'

		// Create enrollment - schema'ga mos
		const enrollment = await prisma.courseEnrollment.create({
			data: {
				courseId,
				userId: user.id,
				fullName,
				phone,
				// answers JSON maydoniga barcha ma'lumotlarni saqlaymiz
				answers: {
					days: days.replace('DAYS|', ''),
					timeSlot: time.replace('TIME|', ''),
					wantCertificate: wantCert
				}
			}
		})

		// notify admin
		const adminIds = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
			.map(x => Number(x || 0))
			.filter(Boolean)

		const kb = new InlineKeyboard()
			.text('✅ Qabul qilish', `CE|APPROVE|${enrollment.id}`)
			.text('❌ Rad etish', `CE|REJECT|${enrollment.id}`)

		for (const a of adminIds) {
			try {
				await ctx.api.sendMessage(
					a,
					[
						`🆕 *Kursga yozilish*`,
						`🎓 Kurs: *${course.title}*`,
						`👤 Ism: ${fullName}`,
						`📞 Telefon: ${phone}`,
						`📅 Kunlar: ${days.replace('DAYS|', '')}`,
						`⏰ Vaqt: ${time.replace('TIME|', '')}`,
						`📄 Sertifikat: ${wantCert ? 'Ha' : 'Yo‘q'}`
					]
						.filter(Boolean)
						.join('\n'),
					{ parse_mode: 'Markdown', reply_markup: kb }
				)
			} catch (err) {
				logger.error({ err, adminId: a }, 'Failed to notify admin about course enrollment')
			}
		}

		await replaceBotMessage(ctx, '✅ *So‘rov yuborildi!*\n\nAdminlar tez orada bog‘lanadi.', {
			parse_mode: 'Markdown'
		})
		return
	}
}
