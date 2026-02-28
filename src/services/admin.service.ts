import { InlineKeyboard } from 'grammy'
import { FileType } from '@prisma/client'

import { type BotContext } from '../bot/bot'
import { applicationRepo } from '../db/repositories/application.repo'
import { fileRepo } from '../db/repositories/file.repo'
import { buildAdminSummary } from '../utils/format'
import { env } from '../config/env'
import { logger } from '../utils/logger'

export class AdminService {
	async sendToAdmin(ctx: BotContext, applicationId: string): Promise<void> {
		const application = await applicationRepo.getWithAnswers(applicationId)
		if (!application) throw new Error('Application not found')

		const photo = await fileRepo.getByType(applicationId, FileType.HALF_BODY)
		const summary = await buildAdminSummary(applicationId)

		const kb = new InlineKeyboard()
			.text('✅ Tasdiqlash', `AD|APPROVE|${applicationId}`)
			.text('❌ Rad etish', `AD|REJECT|${applicationId}`)
			.row()
			.text("👤 User", `AD|CONTACT|${application.telegramId.toString()}`)

		const caption = `📋 *Yangi anketa #${applicationId.slice(0, 8)}*\n\n${summary}`
		if (photo?.cloudinaryUrl) {
			await ctx.api.sendPhoto(env.ADMIN_CHAT_ID, photo.cloudinaryUrl, {
				caption,
				parse_mode: 'Markdown',
				reply_markup: kb
			})
			return
		}
		if (photo?.telegramFileId) {
			await ctx.api.sendPhoto(env.ADMIN_CHAT_ID, photo.telegramFileId, {
				caption,
				parse_mode: 'Markdown',
				reply_markup: kb
			})
			return
		}

		await ctx.api.sendMessage(env.ADMIN_CHAT_ID, caption, {
			parse_mode: 'Markdown',
			reply_markup: kb
		})

		logger.info({ applicationId }, 'Sent application to admin')
	}

	async approve(ctx: BotContext, applicationId: string): Promise<void> {
		await applicationRepo.approve(applicationId, ctx.from?.id)
		const app = await applicationRepo.getById(applicationId)
		if (app) {
			await ctx.api.sendMessage(
				Number(app.telegramId),
				"✅ *Anketangiz tasdiqlandi.*\n\nTez orada siz bilan bog'lanamiz.",
				{ parse_mode: 'Markdown' }
			)
		}
		await ctx.editMessageText(`✅ Anketa #${applicationId.slice(0, 8)} tasdiqlandi.`)
	}

	async askRejectReason(ctx: BotContext, applicationId: string): Promise<void> {
		const kb = new InlineKeyboard()
			.text('📚 Tajriba yetarli emas', `AD|REJ_R|${applicationId}|NO_EXP`)
			.row()
			.text('🗣️ Muloqot past', `AD|REJ_R|${applicationId}|WEAK_COMM`)
			.row()
			.text('📄 Hujjat yetishmaydi', `AD|REJ_R|${applicationId}|DOCS_MISSING`)
			.row()
			.text('💻 Kompyuter bilimi past', `AD|REJ_R|${applicationId}|NO_SKILLS`)
			.row()
			.text('➕ Boshqa', `AD|REJ_R|${applicationId}|OTHER`)

		await ctx.editMessageText('❌ Rad etish sababini tanlang:', { reply_markup: kb })
	}

	async reject(ctx: BotContext, applicationId: string, reasonCode: string): Promise<void> {
		const reasonText = this.mapReason(reasonCode)
		await applicationRepo.reject(applicationId, reasonText, ctx.from?.id)

		const app = await applicationRepo.getById(applicationId)
		if (app) {
			await ctx.api.sendMessage(
				Number(app.telegramId),
				`❌ *Anketangiz rad etildi.*\n\nSabab: ${reasonText}`,
				{ parse_mode: 'Markdown' }
			)
		}

		await ctx.editMessageText(
			`❌ Anketa #${applicationId.slice(0, 8)} rad etildi.\nSabab: ${reasonText}`
		)
	}

	private mapReason(code: string): string {
		switch (code) {
			case 'NO_EXP':
				return 'Tajriba yetarli emas'
			case 'WEAK_COMM':
				return 'Muloqot qobiliyati past'
			case 'DOCS_MISSING':
				return 'Hujjatlar yetishmaydi'
			case 'NO_SKILLS':
				return 'Kompyuter bilimi yetarli emas'
			default:
				return 'Boshqa'
		}
	}
}

export const adminService = new AdminService()
