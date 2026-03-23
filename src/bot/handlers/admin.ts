// src/bot/handlers/admin.ts
// FIXES:
//  - A-004: Idempotency — double-approve/reject now safe (checks current status first)
//  - H-005: user notification failure handled gracefully — admin still gets feedback
//  - C-008: isAdmin parsed once at module level (ADMIN_IDS constant, not per-call env parse)
//  - M-008: Application status cache invalidation on approve/reject
//  - sendApplicationApprovedMessage: user blocked/not found handled explicitly

import { type Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'

import { type BotContext } from '../bot'
import { applicationService } from '../../services/application.service'
import { prisma } from '../../db/prisma'
import { logger } from '../../utils/logger'
import { getUserLang } from '../../utils/i18n'
import { invalidateAuthCache } from '../middlewares/auth'

// C-008 FIX: Parse admin IDs once at startup, not on every call
function parseAdminIds(): number[] {
	return [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
		.map(v => Number(v || 0))
		.filter(v => v > 0 && !isNaN(v))
}
const ADMIN_IDS: number[] = parseAdminIds()

function isAdmin(userId?: number): boolean {
	return Boolean(userId && ADMIN_IDS.includes(userId))
}

function atext(ctx: BotContext, uz: string, ru: string): string {
	return getUserLang(ctx) === 'ru' ? ru : uz
}

function userDisplayName(user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined): string {
	const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
	return full || user?.username || '—'
}

function enrollmentStatusPretty(ctx: BotContext, status: string): string {
	if (status === 'APPROVED') return atext(ctx, 'Qabul qilindi', 'Принята')
	if (status === 'REJECTED') return atext(ctx, 'Rad etildi', 'Отклонена')
	return atext(ctx, 'Kutilmoqda', 'Ожидает')
}

function enrollmentDetailText(
	ctx: BotContext,
	enrollment: {
		course: { title: string } | null
		fullName: string
		phone: string
		createdAt: Date
		user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null
		status: string
	}
): string {
	return [
		`📝 ${enrollment.course?.title || '—'}`,
		`${atext(ctx, '👤 F.I.Sh', '👤 Ф.И.О')}: ${enrollment.fullName || userDisplayName(enrollment.user)}`,
		`📞 ${atext(ctx, 'Telefon', 'Телефон')}: ${enrollment.phone || '—'}`,
		`📍 ${atext(ctx, 'Holat', 'Статус')}: ${enrollmentStatusPretty(ctx, enrollment.status)}`,
		`🗓 ${atext(ctx, 'Sana', 'Дата')}: ${enrollment.createdAt.toLocaleString('ru-RU')}`
	].join('\n')
}

// H-005 FIX: Explicit handling of user blocked / not found / other errors
async function safeNotifyUser(ctx: BotContext, telegramId: bigint, message: string): Promise<boolean> {
	try {
		await ctx.api.sendMessage(Number(telegramId), message, { parse_mode: 'Markdown' })
		return true
	} catch (err: any) {
		const errCode = err?.error_code
		if (errCode === 403) {
			logger.warn({ telegramId: Number(telegramId) }, 'User blocked the bot — cannot notify')
		} else if (errCode === 400) {
			logger.warn({ telegramId: Number(telegramId), err }, 'Bad request when notifying user')
		} else {
			logger.error({ telegramId: Number(telegramId), err }, 'Failed to notify user')
		}
		return false
	}
}

async function sendApplicationApprovedMessage(ctx: BotContext, applicationId: string, text?: string): Promise<boolean> {
	const application = await prisma.application.findUnique({ where: { id: applicationId } })
	if (!application) {
		await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.'))
		return false
	}
	const base = atext(ctx, '✅ Arizangiz qabul qilindi.', '✅ Ваша заявка принята.')
	const message = text ? `${base}\n\n${text}` : base
	return safeNotifyUser(ctx, application.telegramId, message)
}

export async function tryHandleAdminText(ctx: BotContext): Promise<boolean> {
	if (!isAdmin(ctx.from?.id)) return false
	const waitingFor = ctx.session.temp?.waitingFor
	if (!waitingFor) return false
	const applicationId = ctx.session.temp?.approvedApplicationId
	const text = ctx.message?.text?.trim()
	if (!applicationId || !text) return false

	try {
		if (waitingFor === 'custom_schedule') {
			const notified = await sendApplicationApprovedMessage(ctx, applicationId, atext(ctx, `Kelish vaqti: ${text}`, `Время прихода: ${text}`))
			ctx.session.temp.waitingFor = undefined
			ctx.session.temp.approvedApplicationId = undefined
			await ctx.reply(
				notified
					? atext(ctx, '✅ Foydalanuvchiga vaqt yuborildi.', '✅ Время отправлено пользователю.')
					: atext(ctx, '⚠️ Vaqt yuborildi, lekin foydalanuvchi boti bloklagan.', '⚠️ Время записано, но пользователь заблокировал бота.')
			)
			return true
		}

		if (waitingFor === 'approval_message') {
			const notified = await sendApplicationApprovedMessage(ctx, applicationId, text)
			ctx.session.temp.waitingFor = undefined
			ctx.session.temp.approvedApplicationId = undefined
			await ctx.reply(
				notified
					? atext(ctx, '✅ Ariza qabul qilindi va foydalanuvchiga xabar yuborildi.', '✅ Заявка принята и сообщение отправлено.')
					: atext(ctx, '✅ Ariza qabul qilindi. (Foydalanuvchi botni bloklagan)', '✅ Заявка принята. (Пользователь заблокировал бота)')
			)
			return true
		}
	} catch (err) {
		logger.error({ err, applicationId, waitingFor }, 'Failed to handle admin text')
		await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		return true
	}

	return false
}

export function setupAdminHandlers(bot: Bot<BotContext>): void {

	// ── Course enrollment approve ────────────────────────────────────────────
	bot.callbackQuery(/^CE\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const current = await prisma.courseEnrollment.findUnique({
				where: { id: enrollmentId },
				include: { user: true, course: true }
			})
			if (!current) {
				await ctx.reply(atext(ctx, 'Kurs yoziluvi topilmadi (o\'chirilgan bo\'lishi mumkin).', 'Запись не найдена (возможно, удалена).'))
				return
			}
			// A-004 FIX: Idempotency check
			if (current.status === 'APPROVED') {
				await ctx.answerCallbackQuery({ text: atext(ctx, 'Allaqachon qabul qilingan.', 'Уже принята.'), show_alert: false }).catch(() => {})
				await ctx.editMessageText(enrollmentDetailText(ctx, current), { reply_markup: new InlineKeyboard() }).catch(() => {})
				return
			}
			const enrollment = await prisma.courseEnrollment.update({
				where: { id: enrollmentId },
				data: { status: 'APPROVED' },
				include: { user: true, course: true }
			})
			await ctx.editMessageText(enrollmentDetailText(ctx, enrollment), { reply_markup: new InlineKeyboard() }).catch(() => {})
			const notified = await safeNotifyUser(
				ctx,
				enrollment.user.telegramId,
				atext(ctx, `✅ *Kursga yozilish qabul qilindi!*\n\nKurs: *${enrollment.course.title}*`, `✅ *Ваша запись на курс принята!*\n\nКурс: *${enrollment.course.title}*`)
			)
			if (!notified) {
				await ctx.reply(atext(ctx, '⚠️ Qabul qilindi, lekin foydalanuvchi botni bloklagan.', '⚠️ Принято, но пользователь заблокировал бота.'))
			}
		} catch (err) {
			logger.error({ err }, 'Course enrollment approve failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Course enrollment reject ─────────────────────────────────────────────
	bot.callbackQuery(/^CE\|REJECT\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const current = await prisma.courseEnrollment.findUnique({
				where: { id: enrollmentId },
				include: { user: true, course: true }
			})
			if (!current) {
				await ctx.reply(atext(ctx, 'Kurs yoziluvi topilmadi.', 'Запись не найдена.'))
				return
			}
			// A-004 FIX: Idempotency
			if (current.status === 'REJECTED') {
				await ctx.answerCallbackQuery({ text: atext(ctx, 'Allaqachon rad etilgan.', 'Уже отклонена.'), show_alert: false }).catch(() => {})
				await ctx.editMessageText(enrollmentDetailText(ctx, current), { reply_markup: new InlineKeyboard() }).catch(() => {})
				return
			}
			const enrollment = await prisma.courseEnrollment.update({
				where: { id: enrollmentId },
				data: { status: 'REJECTED' },
				include: { user: true, course: true }
			})
			await ctx.editMessageText(enrollmentDetailText(ctx, enrollment), { reply_markup: new InlineKeyboard() }).catch(() => {})
			const notified = await safeNotifyUser(
				ctx,
				enrollment.user.telegramId,
				atext(ctx, `❌ *Kursga yozilish rad etildi.*\n\nKurs: *${enrollment.course.title}*`, `❌ *Ваша запись на курс отклонена.*\n\nКурс: *${enrollment.course.title}*`)
			)
			if (!notified) {
				await ctx.reply(atext(ctx, '⚠️ Rad etildi, lekin foydalanuvchi botni bloklagan.', '⚠️ Отклонено, но пользователь заблокировал бота.'))
			}
		} catch (err) {
			logger.error({ err }, 'Course enrollment reject failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Application review notify ────────────────────────────────────────────
	bot.callbackQuery(/^AD\|REVIEW\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]
			const application = await applicationService.getById(applicationId)
			if (!application) {
				await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.'))
				return
			}
			await prisma.application.update({
				where: { id: applicationId },
				data: { status: 'IN_PROGRESS', reviewedAt: new Date(), reviewedBy: BigInt(ctx.from!.id) }
			})
			invalidateAuthCache(Number(application.telegramId)) // M-008 FIX: invalidate cache on status change
			const notified = await safeNotifyUser(
				ctx,
				application.telegramId,
				atext(ctx, `👀 *Arizangiz ko'rib chiqilmoqda.*\n\nNatija bo'yicha siz bilan tez orada bog'lanamiz.`, `👀 *Ваша заявка находится на рассмотрении.*\n\nМы свяжемся с вами после проверки.`)
			)
			await ctx.reply(
				notified
					? atext(ctx, '✅ Foydalanuvchiga "ko\'rib chiqilmoqda" xabari yuborildi.', '✅ Пользователю отправлено сообщение «на рассмотрении».')
					: atext(ctx, '⚠️ Ariza yangilandi, lekin foydalanuvchi botni bloklagan.', '⚠️ Заявка обновлена, но пользователь заблокировал бота.')
			)
		} catch (err) {
			logger.error({ err }, 'Application review notify failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Application approve ──────────────────────────────────────────────────
	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]

			// A-004 FIX: Check current status before updating
			const current = await prisma.application.findUnique({ where: { id: applicationId } })
			if (!current) {
				await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.'))
				return
			}
			if (current.status === 'APPROVED') {
				await ctx.reply(atext(ctx, 'Bu ariza allaqachon qabul qilingan.', 'Эта заявка уже принята.'))
				return
			}

			await prisma.application.update({
				where: { id: applicationId },
				data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: BigInt(ctx.from!.id) }
			})
			invalidateAuthCache(Number(current.telegramId)) // M-008 FIX

			ctx.session.temp.approvedApplicationId = applicationId
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(atext(ctx, 'Ariza qabul qilindi. Foydalanuvchiga qo\'shimcha xabar yuborasizmi?', 'Заявка принята. Отправить пользователю дополнительное сообщение?'), {
				reply_markup: new InlineKeyboard()
					.text(atext(ctx, '✍️ Xabar yozish', '✍️ Написать сообщение'), `AD|APPMSG|${applicationId}|WRITE`)
					.row()
					.text(atext(ctx, '⏭ O\'tkazib yuborish', '⏭ Пропустить'), `AD|APPMSG|${applicationId}|SKIP`)
			})
		} catch (err) {
			logger.error({ err }, 'Application approve prompt failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Application approval message ─────────────────────────────────────────
	bot.callbackQuery(/^AD\|APPMSG\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const [, , applicationId, mode] = ctx.callbackQuery.data.split('|')
			if (mode === 'WRITE') {
				ctx.session.temp.approvedApplicationId = applicationId
				ctx.session.temp.waitingFor = 'approval_message'
				await ctx.reply(atext(ctx, 'Foydalanuvchiga yuboriladigan xabarni yozing.', 'Напишите сообщение для пользователя.'))
				return
			}
			const notified = await sendApplicationApprovedMessage(ctx, applicationId)
			ctx.session.temp.approvedApplicationId = undefined
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(
				notified
					? atext(ctx, '✅ Ariza qabul qilindi va foydalanuvchiga xabar yuborildi.', '✅ Заявка принята и сообщение отправлено.')
					: atext(ctx, '✅ Ariza qabul qilindi. (Foydalanuvchi botni bloklagan)', '✅ Заявка принята. (Пользователь заблокировал бота)')
			)
		} catch (err) {
			logger.error({ err }, 'Approval message callback failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Schedule callback ────────────────────────────────────────────────────
	bot.callbackQuery(/^SCHEDULE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const [, applicationId, mode] = ctx.callbackQuery.data.split('|')
			if (mode === 'CUSTOM') {
				ctx.session.temp.approvedApplicationId = applicationId
				ctx.session.temp.waitingFor = 'custom_schedule'
				await ctx.reply(atext(ctx, 'Kelish vaqtini matn ko\'rinishida yuboring. Masalan: ertaga 10:00 ga keling.', 'Отправьте время прихода текстом. Например: приходите завтра в 10:00.'))
				return
			}
			const textMap: Record<string, string> = getUserLang(ctx) === 'ru'
				? { TODAY: 'Время прихода: *сегодня*.', TOMORROW: 'Время прихода: *завтра*.', THREE_DAYS: 'Время прихода: *через 3 дня*.' }
				: { TODAY: 'Kelish vaqti: *bugun*.', TOMORROW: 'Kelish vaqti: *ertaga*.', THREE_DAYS: 'Kelish vaqti: *3 kundan keyin*.' }
			const text = textMap[mode]
			if (!text) { await ctx.reply(atext(ctx, 'Noto\'g\'ri tanlov.', 'Неверный выбор.')); return }
			const notified = await sendApplicationApprovedMessage(ctx, applicationId, text)
			ctx.session.temp.approvedApplicationId = undefined
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(notified
				? atext(ctx, '✅ Foydalanuvchiga xabar yuborildi.', '✅ Сообщение отправлено пользователю.')
				: atext(ctx, '⚠️ Xabar yuborilmadi — foydalanuvchi botni bloklagan.', '⚠️ Сообщение не отправлено — пользователь заблокировал бота.')
			)
		} catch (err) {
			logger.error({ err }, 'Schedule callback failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	// ── Application reject ───────────────────────────────────────────────────
	bot.callbackQuery(/^AD\|REJECT\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]

			// A-004 FIX: Check before showing reason picker
			const current = await prisma.application.findUnique({ where: { id: applicationId } })
			if (!current) { await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.')); return }
			if (current.status === 'REJECTED') { await ctx.reply(atext(ctx, 'Bu ariza allaqachon rad etilgan.', 'Эта заявка уже отклонена.')); return }

			const kb = new InlineKeyboard()
				.text('Tajriba yetarli emas', `AD|REJ_R|${applicationId}|NO_EXP`).row()
				.text('Muloqot past', `AD|REJ_R|${applicationId}|WEAK_COMM`).row()
				.text('Hujjat yetishmaydi', `AD|REJ_R|${applicationId}|DOCS_MISSING`).row()
				.text('Boshqa', `AD|REJ_R|${applicationId}|OTHER`)
			await ctx.reply(atext(ctx, 'Rad etish sababini tanlang.', 'Выберите причину отказа.'), { reply_markup: kb })
		} catch (err) {
			logger.error({ err }, 'Reject prompt failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	bot.callbackQuery(/^AD\|REJ_R\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const [, , applicationId, reasonCode] = ctx.callbackQuery.data.split('|')
			const reasonMap: Record<string, string> = {
				NO_EXP: 'Tajriba yetarli emas',
				WEAK_COMM: 'Muloqot qobiliyati past',
				DOCS_MISSING: 'Hujjatlar yetishmaydi',
				OTHER: 'Boshqa sabab'
			}
			const reason = reasonMap[reasonCode] ?? 'Boshqa sabab'
			await prisma.application.update({
				where: { id: applicationId },
				data: { status: 'REJECTED', reviewedAt: new Date(), reviewedBy: BigInt(ctx.from!.id), rejectionReason: reason }
			})

			const application = await applicationService.getById(applicationId)
			if (application) {
				invalidateAuthCache(Number(application.telegramId)) // M-008 FIX
				const notified = await safeNotifyUser(
					ctx,
					application.telegramId,
					`❌ *Arizangiz rad etildi.*\n\nSabab: ${reason}`
				)
				await ctx.editMessageText(`❌ Ariza rad etildi.\nSabab: ${reason}${!notified ? '\n⚠️ Foydalanuvchi botni bloklagan.' : ''}`)
			} else {
				await ctx.editMessageText(`❌ Ariza rad etildi.\nSabab: ${reason}`)
			}
		} catch (err) {
			logger.error({ err }, 'Reject handler failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})
}
