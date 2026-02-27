import { Context } from '../bot'
import { InlineKeyboard } from 'grammy'
import { applicationRepo } from '../db/repositories/application.repo'
import { fileRepo } from '../db/repositories/file.repo'
import { answerRepo } from '../db/repositories/answer.repo'
import { buildAdminSummary } from '../utils/format'
import { logger } from '../utils/logger'
import { env } from '../config/env'

export class AdminService {
	async sendToAdmin(ctx: Context, applicationId: string): Promise<void> {
		try {
			const application = await applicationRepo.getWithAnswers(applicationId)
			if (!application) {
				throw new Error('Application not found')
			}

			const photo = await fileRepo.getByType(applicationId, 'HALF_BODY')
			const summary = await buildAdminSummary(applicationId)

			// Admin keyboard
			const keyboard = new InlineKeyboard()
				.text('✅ Tasdiqlash', `AD|APPROVE|${applicationId}`)
				.text('❌ Rad etish', `AD|REJECT|${applicationId}`)
				.row()
				.text("👤 Foydalanuvchi bilan bog'lanish", `AD|CONTACT|${application.telegramId}`)

			// Rasm bilan yuborish
			if (photo) {
				await ctx.api.sendPhoto(env.ADMIN_CHAT_ID, photo.telegramFileId, {
					caption: `📋 *Yangi anketa #${applicationId.slice(0, 8)}*\n\n${summary}`,
					parse_mode: 'Markdown',
					reply_markup: keyboard
				})
			} else {
				await ctx.api.sendMessage(
					env.ADMIN_CHAT_ID,
					`📋 *Yangi anketa #${applicationId.slice(0, 8)}*\n\n${summary}`,
					{
						parse_mode: 'Markdown',
						reply_markup: keyboard
					}
				)
			}

			logger.info({ applicationId }, 'Application sent to admin')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to send to admin')
			throw error
		}
	}

	async handleApprove(ctx: Context, applicationId: string): Promise<void> {
		try {
			await applicationRepo.updateStatus(applicationId, 'APPROVED')

			const application = await applicationRepo.getById(applicationId)

			// Foydalanuvchiga xabar yuborish
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					"✅ *Tabriklaymiz! Anketangiz tasdiqlandi.*\n\nTez orada administratorlarimiz siz bilan bog'lanadi.",
					{ parse_mode: 'Markdown' }
				)
			}

			// Admin chatga javob
			await ctx.editMessageText(`✅ Anketa #${applicationId.slice(0, 8)} tasdiqlandi`, {
				parse_mode: 'Markdown'
			})

			logger.info({ applicationId }, 'Application approved')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to approve application')
			throw error
		}
	}

	async handleReject(ctx: Context, applicationId: string): Promise<void> {
		try {
			const reasons = [
				{ text: '📚 Tajriba yetarli emas', data: `AD|REJ_REASON|${applicationId}|NO_EXP` },
				{ text: '🗣️ Muloqot qobiliyati past', data: `AD|REJ_REASON|${applicationId}|WEAK_COMM` },
				{ text: '📄 Hujjatlar yetishmaydi', data: `AD|REJ_REASON|${applicationId}|DOCS_MISSING` },
				{
					text: '💻 Kompyuter bilimi yetarli emas',
					data: `AD|REJ_REASON|${applicationId}|NO_SKILLS`
				},
				{ text: '➕ Boshqa', data: `AD|REJ_REASON|${applicationId}|OTHER` }
			]

			const keyboard = new InlineKeyboard()
			reasons.forEach((reason, index) => {
				keyboard.text(reason.text, reason.data)
				if (index % 2 === 1) keyboard.row()
			})

			await ctx.editMessageText(`❌ Rad etish sababini tanlang:`, {
				parse_mode: 'Markdown',
				reply_markup: keyboard
			})
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to show reject reasons')
			throw error
		}
	}

	async handleRejectWithReason(ctx: Context, applicationId: string, reason: string): Promise<void> {
		try {
			await applicationRepo.updateStatus(applicationId, 'REJECTED')

			const application = await applicationRepo.getById(applicationId)

			// Sabab matnini o'zbekchalashtirish
			let reasonText = ''
			switch (reason) {
				case 'NO_EXP':
					reasonText = 'Tajriba yetarli emas'
					break
				case 'WEAK_COMM':
					reasonText = 'Muloqot qobiliyati past'
					break
				case 'DOCS_MISSING':
					reasonText = 'Hujjatlar yetishmaydi'
					break
				case 'NO_SKILLS':
					reasonText = 'Kompyuter bilimi yetarli emas'
					break
				default:
					reasonText = 'Boshqa sabab'
			}

			// Foydalanuvchiga xabar yuborish
			if (application) {
				await ctx.api.sendMessage(
					Number(application.telegramId),
					`❌ *Anketangiz rad etildi.*\n\nSabab: ${reasonText}\n\nBatafsil ma'lumot uchun administrator bilan bog\'laning.`,
					{ parse_mode: 'Markdown' }
				)
			}

			// Admin chatga javob
			await ctx.editMessageText(
				`❌ Anketa #${applicationId.slice(0, 8)} rad etildi\nSabab: ${reasonText}`,
				{ parse_mode: 'Markdown' }
			)

			logger.info({ applicationId, reason }, 'Application rejected')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to reject application')
			throw error
		}
	}
}

export const adminService = new AdminService()
