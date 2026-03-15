import { type Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'

import { type BotContext } from '../bot'
import { applicationService } from '../../services/application.service'
import { logger } from '../../utils/logger'
import {
	claimAdminAction,
	getApplicationTelegramId,
	transitionApplicationStatus,
	transitionEnrollmentStatus
} from '../../modules/admin/admin-actions.dao'
import { getUserLang } from '../../utils/i18n'


function atext(ctx: BotContext, uz: string, ru: string): string {
	return getUserLang(ctx) === 'ru' ? ru : uz
}

function isAdmin(userId?: number): boolean {
	const admins = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
		.map(v => Number(v || 0))
		.filter(Boolean)
	return Boolean(userId && admins.includes(userId))
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

function scheduleKeyboard(applicationId: string) {
	return new InlineKeyboard()
		.text('📅 Bugun', `SCHEDULE|${applicationId}|TODAY`)
		.text('📅 Ertaga', `SCHEDULE|${applicationId}|TOMORROW`)
		.row()
		.text('📅 3 kundan keyin', `SCHEDULE|${applicationId}|THREE_DAYS`)
		.text('✍️ Qo‘lda kiritish', `SCHEDULE|${applicationId}|CUSTOM`)
}

async function sendApplicationApprovedMessage(ctx: BotContext, applicationId: string, text?: string) {
	const telegramId = await getApplicationTelegramId(applicationId)
	if (!telegramId) {
		await ctx.reply('Ariza topilmadi.')
		return
	}

	const base = getUserLang(ctx) === 'ru' ? '✅ Ваша заявка принята.' : '✅ Arizangiz qabul qilindi.'
	const message = text ? `${base}\n\n${text}` : base
	await ctx.api.sendMessage(Number(telegramId), message)
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
			await sendApplicationApprovedMessage(ctx, applicationId, atext(ctx, `Kelish vaqti: ${text}`, `Время прихода: ${text}`))
			ctx.session.temp.waitingFor = undefined
			ctx.session.temp.approvedApplicationId = undefined
			await ctx.reply(atext(ctx, '✅ Foydalanuvchiga vaqt yuborildi.', '✅ Время отправлено пользователю.'))
			return true
		}

		if (waitingFor === 'approval_message') {
			await sendApplicationApprovedMessage(ctx, applicationId, text)
			ctx.session.temp.waitingFor = undefined
			ctx.session.temp.approvedApplicationId = undefined
			await ctx.reply(atext(ctx, '✅ Ariza qabul qilindi va foydalanuvchiga xabar yuborildi.', '✅ Заявка принята и сообщение пользователю отправлено.'))
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
	bot.callbackQuery(/^CE\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const actionClaimed = await claimAdminAction(`ce:approve:${enrollmentId}`)
			if (!actionClaimed) return

			const enrollment = await transitionEnrollmentStatus({ enrollmentId, nextStatus: 'APPROVED' })
			if (enrollment.kind === 'not_found') {
				await ctx.reply(atext(ctx, 'Yozilish topilmadi.', 'Запись не найдена.'))
				return
			}

			await ctx.editMessageText([
				`📝 ${enrollment.courseTitle}`,
				`${atext(ctx, '👤 F.I.Sh', '👤 Ф.И.О')}: ${enrollment.fullName || '—'}`,
				`📞 ${atext(ctx, 'Telefon', 'Телефон')}: ${enrollment.phone || '—'}`,
				`📍 ${atext(ctx, 'Holat', 'Статус')}: ${enrollmentStatusPretty(ctx, 'APPROVED')}`,
				`🗓 ${atext(ctx, 'Sana', 'Дата')}: ${new Date(enrollment.createdAt).toLocaleString('ru-RU')}`
			].join('\n'))
			await ctx.api.sendMessage(
				Number(enrollment.telegramId),
				atext(ctx, `✅ *Kursga yozilish qabul qilindi!*\n\nKurs: *${enrollment.courseTitle}*`, `✅ *Ваша запись на курс принята!*\n\nКурс: *${enrollment.courseTitle}*`),
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Course enrollment approve failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	bot.callbackQuery(/^CE\|REJECT\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const actionClaimed = await claimAdminAction(`ce:reject:${enrollmentId}`)
			if (!actionClaimed) return
			const enrollment = await transitionEnrollmentStatus({ enrollmentId, nextStatus: 'REJECTED' })
			if (enrollment.kind === 'not_found') {
				await ctx.reply(atext(ctx, 'Yozilish topilmadi.', 'Запись не найдена.'))
				return
			}

			await ctx.editMessageText([
				`📝 ${enrollment.courseTitle}`,
				`${atext(ctx, '👤 F.I.Sh', '👤 Ф.И.О')}: ${enrollment.fullName || '—'}`,
				`📞 ${atext(ctx, 'Telefon', 'Телефон')}: ${enrollment.phone || '—'}`,
				`📍 ${atext(ctx, 'Holat', 'Статус')}: ${enrollmentStatusPretty(ctx, 'REJECTED')}`,
				`🗓 ${atext(ctx, 'Sana', 'Дата')}: ${new Date(enrollment.createdAt).toLocaleString('ru-RU')}`
			].join('\n'))
			await ctx.api.sendMessage(
				Number(enrollment.telegramId),
				atext(ctx, `❌ *Kursga yozilish rad etildi.*\n\nKurs: *${enrollment.courseTitle}*`, `❌ *Ваша запись на курс отклонена.*\n\nКурс: *${enrollment.courseTitle}*`),
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Course enrollment reject failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})


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
			const actionClaimed = await claimAdminAction(`ad:review:${applicationId}`)
			if (!actionClaimed) return
			await transitionApplicationStatus({
				applicationId,
				adminTelegramId: ctx.from!.id,
				nextStatus: 'IN_PROGRESS'
			})
			await ctx.api.sendMessage(
				Number(application.telegramId),
				atext(ctx, `👀 *Arizangiz ko‘rib chiqilmoqda.*\n\nNatija bo‘yicha siz bilan tez orada bog‘lanamiz.`, `👀 *Ваша заявка находится на рассмотрении.*\n\nМы свяжемся с вами после проверки.`),
				{ parse_mode: 'Markdown' }
			)
			await ctx.reply(atext(ctx, '✅ Foydalanuvchiga “ko‘rib chiqilmoqda” xabari yuborildi.', '✅ Пользователю отправлено сообщение «на рассмотрении».'))
		} catch (err) {
			logger.error({ err }, 'Application review notify failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]
			const actionClaimed = await claimAdminAction(`ad:approve:${applicationId}`)
			if (!actionClaimed) return
			const transition = await transitionApplicationStatus({
				applicationId,
				adminTelegramId: ctx.from!.id,
				nextStatus: 'APPROVED'
			})
			if (transition.kind === 'not_found') {
				await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.'))
				return
			}

			ctx.session.temp.approvedApplicationId = applicationId
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(atext(ctx, 'Ariza qabul qilindi. Foydalanuvchiga qo‘shimcha xabar yuborasizmi?', 'Заявка принята. Отправить пользователю дополнительное сообщение?'), {
				reply_markup: new InlineKeyboard()
					.text(atext(ctx, '✍️ Xabar yozish', '✍️ Написать сообщение'), `AD|APPMSG|${applicationId}|WRITE`)
					.row()
					.text(atext(ctx, '⏭ O‘tkazib yuborish', '⏭ Пропустить'), `AD|APPMSG|${applicationId}|SKIP`)
			})
		} catch (err) {
			logger.error({ err }, 'Application approve prompt failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

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
			await sendApplicationApprovedMessage(ctx, applicationId)
			ctx.session.temp.approvedApplicationId = undefined
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(atext(ctx, '✅ Ariza qabul qilindi va foydalanuvchiga xabar yuborildi.', '✅ Заявка принята и сообщение пользователю отправлено.'))
		} catch (err) {
			logger.error({ err }, 'Approval message callback failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	bot.callbackQuery(/^SCHEDULE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const [, applicationId, mode] = ctx.callbackQuery.data.split('|')

			if (mode === 'CUSTOM') {
				ctx.session.temp.approvedApplicationId = applicationId
				ctx.session.temp.waitingFor = 'custom_schedule'
				await ctx.reply(atext(ctx, 'Kelish vaqtini matn ko‘rinishida yuboring. Masalan: ertaga 10:00 ga keling.', 'Отправьте время прихода текстом. Например: приходите завтра в 10:00.'))
				return
			}

			const textMap: Record<string, string> = getUserLang(ctx) === 'ru'
				? { TODAY: 'Время прихода: *сегодня*.', TOMORROW: 'Время прихода: *завтра*.', THREE_DAYS: 'Время прихода: *через 3 дня*.' }
				: { TODAY: 'Kelish vaqti: *bugun*.', TOMORROW: 'Kelish vaqti: *ertaga*.', THREE_DAYS: 'Kelish vaqti: *3 kundan keyin*.' }
			const text = textMap[mode]
			if (!text) {
				await ctx.reply(atext(ctx, 'Noto‘g‘ri tanlov.', 'Неверный выбор.'))
				return
			}

			await sendApplicationApprovedMessage(ctx, applicationId, text)
			ctx.session.temp.approvedApplicationId = undefined
			ctx.session.temp.waitingFor = undefined
			await ctx.reply(atext(ctx, '✅ Foydalanuvchiga xabar yuborildi.', '✅ Сообщение отправлено пользователю.'))
		} catch (err) {
			logger.error({ err }, 'Schedule callback failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})

	bot.callbackQuery(/^AD\|REJECT\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]
			const kb = new InlineKeyboard()
				.text('Tajriba yetarli emas', `AD|REJ_R|${applicationId}|NO_EXP`)
				.row()
				.text('Muloqot past', `AD|REJ_R|${applicationId}|WEAK_COMM`)
				.row()
				.text('Hujjat yetishmaydi', `AD|REJ_R|${applicationId}|DOCS_MISSING`)
				.row()
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
			const actionClaimed = await claimAdminAction(`ad:reject:${applicationId}:${reasonCode}`)
			if (!actionClaimed) return
			const transition = await transitionApplicationStatus({
				applicationId,
				adminTelegramId: ctx.from!.id,
				nextStatus: 'REJECTED',
				rejectionReason: reason
			})
			if (transition.kind === 'not_found') {
				await ctx.reply(atext(ctx, 'Ariza topilmadi.', 'Заявка не найдена.'))
				return
			}

			const application = await applicationService.getById(applicationId)
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					`❌ *Arizangiz rad etildi.*\n\nSabab: ${reason}`,
					{ parse_mode: 'Markdown' }
				)
			}
			await ctx.editMessageText(`❌ Ariza rad etildi.\nSabab: ${reason}`)
		} catch (err) {
			logger.error({ err }, 'Reject handler failed')
			await ctx.reply(atext(ctx, 'Xatolik yuz berdi.', 'Произошла ошибка.'))
		}
	})
}
