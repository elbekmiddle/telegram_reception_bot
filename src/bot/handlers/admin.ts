import { type Bot } from 'grammy'
import { InlineKeyboard } from 'grammy'

import { type BotContext } from '../bot'
import { adminService } from '../../services/admin.service'
import { applicationService } from '../../services/application.service'
import { logger } from '../../utils/logger'

export function setupAdminHandlers(bot: Bot<BotContext>): void {
	// Ariza qabul qilish (APPROVE)
	bot.callbackQuery(/^AD\|APPROVE\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const applicationId = parts[2]

			// Arizani qabul qilish
			await adminService.approve(ctx, applicationId)

			// Arizachiga xabar yuborish
			const application = await applicationService.getById(applicationId)
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					"✅ *Arizangiz qabul qilindi!*\n\nTez orada siz bilan bog'lanamiz.",
					{ parse_mode: 'Markdown' }
				)
			}

			// Admin xabarini yangilash
			await ctx.editMessageText(`✅ Ariza #${applicationId.slice(0, 8)} qabul qilindi`, {
				parse_mode: 'Markdown'
			})
		} catch (err) {
			logger.error({ err }, 'Admin approve failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Ariza rad etish (REJECT) - sabab so'rash
	bot.callbackQuery(/^AD\|REJECT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const applicationId = parts[2]

			// Rad etish sababini so'rash
			await adminService.askRejectReason(ctx, applicationId)
		} catch (err) {
			logger.error({ err }, 'Admin reject prompt failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Rad etish sababi bilan arizani rad etish
	bot.callbackQuery(/^AD\|REJ_R\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const applicationId = parts[2]
			const reason = decodeURIComponent(parts[3]) // Sababni dekodlash

			// Arizani rad etish
			await adminService.reject(ctx, applicationId, reason)

			// Arizachiga xabar yuborish
			const application = await applicationService.getById(applicationId)
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					`❌ *Arizangiz rad etildi!*\n\nSabab: ${reason}\n\nBoshqa vakansiyalarga topshirishingiz mumkin.`,
					{ parse_mode: 'Markdown' }
				)
			}

			// Admin xabarini yangilash
			await ctx.editMessageText(
				`❌ Ariza #${applicationId.slice(0, 8)} rad etildi\nSabab: ${reason}`,
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Admin reject failed')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Foydalanuvchi bilan bog'lanish (CONTACT)
	bot.callbackQuery(/^AD\|CONTACT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const telegramId = parts[2]

			// Foydalanuvchi profiliga link yuborish
			await ctx.reply(`📱 Foydalanuvchi profili: tg://user?id=${telegramId}`)
		} catch (err) {
			logger.error({ err }, 'Admin contact failed')
		}
	})

	// Ariza ma'lumotlarini ko'rish (VIEW)
	bot.callbackQuery(/^AD\|VIEW\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const applicationId = parts[2]

			// Ariza ma'lumotlarini olish
			const application = await applicationService.getById(applicationId)
			if (!application) {
				await ctx.reply('Ariza topilmadi.')
				return
			}

			// Ariza ma'lumotlarini formatlash
			let message = `📋 *Ariza #${applicationId.slice(0, 8)}*\n\n`
			message += `👤 *Telegram ID:* ${application.telegramId}\n`
			message += `📅 *Yaratilgan:* ${new Date(application.createdAt).toLocaleString('uz-UZ')}\n`
			message += `📊 *Holat:* ${application.status}\n`

			if (application.submittedAt) {
				message += `📤 *Topshirilgan:* ${new Date(application.submittedAt).toLocaleString(
					'uz-UZ'
				)}\n`
			}

			// Javoblarni qo'shish
			if (application.answers && application.answers.length > 0) {
				message += '\n*📝 Javoblar:*\n'
				for (const answer of application.answers) {
					message += `• ${answer.fieldKey}: ${answer.fieldValue}\n`
				}
			}

			const kb = new InlineKeyboard()
				.text('✅ Qabul qilish', `AD|APPROVE|${applicationId}`)
				.text('❌ Rad etish', `AD|REJECT|${applicationId}`)
				.row()
				.text("📞 Bog'lanish", `AD|CONTACT|${application.telegramId}`)

			await ctx.reply(message, {
				parse_mode: 'Markdown',
				reply_markup: kb
			})
		} catch (err) {
			logger.error({ err }, 'Admin view failed')
		}
	})

	// Rad etish sababini tanlash uchun tugmalar
	bot.callbackQuery(/^AD\|REASON\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data
			if (!data) return

			const parts = data.split('|')
			const applicationId = parts[2]
			const reasonKey = parts[3]

			let reason = ''
			switch (reasonKey) {
				case 'EXPERIENCE':
					reason = 'Tajriba yetarli emas'
					break
				case 'EDUCATION':
					reason = "Ma'lumot mos kelmadi"
					break
				case 'AGE':
					reason = 'Yosh cheklovi'
					break
				case 'LANGUAGE':
					reason = 'Til bilish darajasi yetarli emas'
					break
				case 'OTHER':
					reason = 'Boshqa sabab'
					break
				default:
					reason = reasonKey
			}

			// Rad etish sababi bilan arizani rad etish
			await adminService.reject(ctx, applicationId, reason)

			// Arizachiga xabar yuborish
			const application = await applicationService.getById(applicationId)
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					`❌ *Arizangiz rad etildi!*\n\nSabab: ${reason}\n\nBoshqa vakansiyalarga topshirishingiz mumkin.`,
					{ parse_mode: 'Markdown' }
				)
			}

			// Admin xabarini yangilash
			await ctx.editMessageText(
				`❌ Ariza #${applicationId.slice(0, 8)} rad etildi\nSabab: ${reason}`,
				{ parse_mode: 'Markdown' }
			)
		} catch (err) {
			logger.error({ err }, 'Admin reason failed')
		}
	})

	// Barcha arizalar ro'yxati
	bot.callbackQuery('AD|LIST_ALL', async ctx => {
		try {
			await ctx.answerCallbackQuery()

			const applications = await applicationService.getAll({
				status: 'SUBMITTED',
				orderBy: { submittedAt: 'desc' },
				take: 10
			})

			if (!applications.length) {
				await ctx.reply('📭 Yangi arizalar mavjud emas.')
				return
			}

			let message = '*📋 Yangi arizalar roʻyxati*\n\n'
			const kb = new InlineKeyboard()

			for (let i = 0; i < applications.length; i++) {
				const app = applications[i]
				message += `${i + 1}. 🆔 #${app.id.slice(0, 8)}\n`
				message += `   📅 ${new Date(app.submittedAt!).toLocaleString('uz-UZ')}\n\n`

				kb.text(`Ariza #${i + 1}`, `AD|VIEW|${app.id}`)
				if ((i + 1) % 2 === 0) kb.row()
			}

			await ctx.reply(message, {
				parse_mode: 'Markdown',
				reply_markup: kb
			})
		} catch (err) {
			logger.error({ err }, 'Admin list all failed')
		}
	})
}
