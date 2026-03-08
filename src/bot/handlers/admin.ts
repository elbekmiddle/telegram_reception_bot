import { type Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'

import { type BotContext } from '../bot'
import { applicationService } from '../../services/application.service'
import { prisma } from '../../db/prisma'
import { logger } from '../../utils/logger'

function isAdmin(userId?: number): boolean {
	const admins = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
		.map(v => Number(v || 0))
		.filter(Boolean)
	return Boolean(userId && admins.includes(userId))
}

function scheduleKeyboard(applicationId: string) {
	return new InlineKeyboard()
		.text('📅 Bugun', `SCHEDULE|${applicationId}|TODAY`)
		.text('📅 Ertaga', `SCHEDULE|${applicationId}|TOMORROW`)
		.row()
		.text('📅 3 kundan keyin', `SCHEDULE|${applicationId}|THREE_DAYS`)
		.text('✍️ Qo‘lda kiritish', `SCHEDULE|${applicationId}|CUSTOM`)
}

async function sendApplicationApprovedMessage(ctx: BotContext, applicationId: string, text: string) {
	const application = await prisma.application.findUnique({ where: { id: applicationId } })
	if (!application) {
		await ctx.reply('Ariza topilmadi.')
		return
	}

	await ctx.api.sendMessage(
		Number(application.telegramId),
		`✅ *Arizangiz qabul qilindi!*\n\n${text}`,
		{ parse_mode: 'Markdown' }
	)
}

export async function tryHandleAdminText(ctx: BotContext): Promise<boolean> {
	if (!isAdmin(ctx.from?.id)) return false
	if (ctx.session.temp?.waitingFor !== 'custom_schedule') return false
	const applicationId = ctx.session.temp?.approvedApplicationId
	const customText = ctx.message?.text?.trim()
	if (!applicationId || !customText) return false

	try {
		await sendApplicationApprovedMessage(ctx, applicationId, `Kelish vaqti: *${customText}*`)
		ctx.session.temp.waitingFor = undefined
		ctx.session.temp.approvedApplicationId = undefined
		await ctx.reply('✅ Foydalanuvchiga vaqt yuborildi.')
		return true
	} catch (err) {
		logger.error({ err, applicationId }, 'Failed to send custom schedule message')
		await ctx.reply('Xatolik yuz berdi.')
		return true
	}
}

export function setupAdminHandlers(bot: Bot<BotContext>): void {
	bot.callbackQuery(/^CE\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const enrollment = await prisma.courseEnrollment.update({
				where: { id: enrollmentId },
				data: { status: 'APPROVED' },
				include: { user: true, course: true }
			})

			await ctx.editMessageText('✅ Kursga yozilish qabul qilindi.')
			await ctx.api.sendMessage(
				Number(enrollment.user.telegramId),
				`✅ *Kursga yozilish qabul qilindi!*\n\nKurs: *${enrollment.course.title}*`,
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Course enrollment approve failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.callbackQuery(/^CE\|REJECT\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const enrollmentId = ctx.callbackQuery.data.split('|')[2]
			const enrollment = await prisma.courseEnrollment.update({
				where: { id: enrollmentId },
				data: { status: 'REJECTED' },
				include: { user: true, course: true }
			})

			await ctx.editMessageText('❌ Kursga yozilish rad etildi.')
			await ctx.api.sendMessage(
				Number(enrollment.user.telegramId),
				`❌ *Kursga yozilish rad etildi.*\n\nKurs: *${enrollment.course.title}*`,
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Course enrollment reject failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		if (!isAdmin(ctx.from?.id)) return
		try {
			await ctx.answerCallbackQuery()
			const applicationId = ctx.callbackQuery.data.split('|')[2]
			await prisma.application.update({
				where: { id: applicationId },
				data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: BigInt(ctx.from!.id) }
			})

			ctx.session.temp.approvedApplicationId = applicationId
			ctx.session.temp.waitingFor = undefined
			await ctx.reply('Foydalanuvchiga yuboriladigan kelish vaqtini tanlang.', {
				reply_markup: scheduleKeyboard(applicationId)
			})
		} catch (err) {
			logger.error({ err }, 'Application approve prompt failed')
			await ctx.reply('Xatolik yuz berdi.')
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
				await ctx.reply('Kelish vaqtini matn ko‘rinishida yuboring. Masalan: ertaga 10:00 ga keling.')
				return
			}

			const textMap: Record<string, string> = {
				TODAY: 'Kelish vaqti: *bugun*.',
				TOMORROW: 'Kelish vaqti: *ertaga*.',
				THREE_DAYS: 'Kelish vaqti: *3 kundan keyin*.'
			}
			const text = textMap[mode]
			if (!text) {
				await ctx.reply('Noto‘g‘ri tanlov.')
				return
			}

			await sendApplicationApprovedMessage(ctx, applicationId, text)
			ctx.session.temp.approvedApplicationId = undefined
			ctx.session.temp.waitingFor = undefined
			await ctx.reply('✅ Foydalanuvchiga xabar yuborildi.')
		} catch (err) {
			logger.error({ err }, 'Schedule callback failed')
			await ctx.reply('Xatolik yuz berdi.')
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
			await ctx.reply('Rad etish sababini tanlang.', { reply_markup: kb })
		} catch (err) {
			logger.error({ err }, 'Reject prompt failed')
			await ctx.reply('Xatolik yuz berdi.')
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
				data: {
					status: 'REJECTED',
					reviewedAt: new Date(),
					reviewedBy: BigInt(ctx.from!.id),
					rejectionReason: reason
				}
			})

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
			await ctx.reply('Xatolik yuz berdi.')
		}
	})
}
