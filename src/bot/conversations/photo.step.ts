import { InlineKeyboard } from 'grammy'
import type { Conversation } from '@grammyjs/conversations'
import { type BotContext } from '../bot'
import { photoService, type HalfBodyPhotoRules } from '../../services/photo.service'
import { keyboards } from '../../utils/keyboards'
import { applicationService } from '../../services/application.service'
import { FileType } from '@prisma/client'
import { answerRepo } from '../../db/repositories/answer.repo'
import { AnswerFieldType } from '@prisma/client'

export type HalfBodyPhotoResult = {
	telegramFileId: string
	cloudinaryUrl: string
	cloudinaryPublicId: string
	meta: {
		width: number
		height: number
		ratio: number
	}
}

export class PhotoStep {
	static async handle(
		conversation: Conversation<BotContext>,
		ctx: BotContext,
		rules: HalfBodyPhotoRules,
		applicationId: string
	): Promise<HalfBodyPhotoResult> {
		let lastMessageId: number | null = null

		const kb = new InlineKeyboard()
			.text("📋 Qoidani ko'rsat", 'PHOTO|RULES')
			.row()
			.text('⬅️ Orqaga', 'NAV|BACK')
			.text('❌ Bekor qilish', 'NAV|CANCEL')

		const sentMsg = await ctx.reply(
			[
				'📸 *Belidan yuqori rasm yuboring*',
				'',
				'✅ Talablar:',
				"• Rasm *beldan yuqori qismi* bo'lishi kerak",
				"• Yuzingiz aniq ko'rinsin",
				'• Tik (portret) format',
				`• Kamida ${rules.minWidth}x${rules.minHeight} piksel`,
				"• Boshqa shaxslar bo'lmasligi kerak",
				'',
				'Rasmni yuboring:'
			].join('\n'),
			{ parse_mode: 'Markdown', reply_markup: kb }
		)
		lastMessageId = sentMsg.message_id

		while (true) {
			const u = await conversation.wait()

			if (u.callbackQuery) {
				await u.answerCallbackQuery()
				const data = u.callbackQuery.data
				if (data === 'NAV|BACK') throw new Error('BACK')
				if (data === 'NAV|CANCEL') throw new Error('CANCEL')
				if (data === 'PHOTO|RULES') {
					if (lastMessageId) {
						try {
							await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
						} catch (error) {}
					}

					const rulesMsg = await ctx.reply(
						[
							"📋 *To'g'ri / noto'g'ri misol:*",
							"✅ To'g'ri: yuz yaqin, yelka/bel ko'rinadi, fon oddiy.",
							"❌ Noto'g'ri: pasport 3x4, juda uzoqdan, juda kichik/loyqa, bir necha odam.",
							'',
							'Endi rasm yuboring:'
						].join('\n'),
						{ parse_mode: 'Markdown' }
					)
					lastMessageId = rulesMsg.message_id
					continue
				}
			}

			if (!u.message?.photo?.length) {
				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (error) {}
				}

				const errorMsg = await ctx.reply('Iltimos, rasmni PHOTO ko‘rinishida yuboring.', {
					reply_markup: keyboards.photoRetryOrRules()
				})
				lastMessageId = errorMsg.message_id
				continue
			}

			const best = u.message.photo[u.message.photo.length - 1]
			const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, rules)

			if (!validated.ok) {
				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (error) {}
				}

				const errorMsg = await ctx.reply(validated.reason, {
					reply_markup: keyboards.photoRetryOrRules()
				})
				lastMessageId = errorMsg.message_id
				continue
			}

			// Rasmni Cloudinary ga yuklash
			// Qo'shimcha: avvalgi yuborilgan rasm bilan o'xshashligini tekshirish (oddiy aHash)
			const newHash = await photoService.computeImageHash(validated.buffer)
			const oldHash = await answerRepo.getByKey(applicationId, 'photo_hash')
			if (oldHash?.fieldValue) {
				const dist = photoService.hammingDistance(oldHash.fieldValue, newHash)
				// juda katta farq bo'lsa - boshqa rasm deb hisoblaymiz
				if (dist > 10) {
					if (lastMessageId) {
						try {
							await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
						} catch (error) {}
					}
					const warn = await ctx.reply(
						"❗ Yuborgan rasmingiz avvalgi rasmingizga mos kelmadi. Iltimos, o'zingizning beldan yuqori rasmingizni yuboring.",
						{ reply_markup: keyboards.photoRetryOrRules() }
					)
					lastMessageId = warn.message_id
					continue
				}
			}

			const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)
			await applicationService.saveAnswer(applicationId, 'photo_hash', newHash, AnswerFieldType.TEXT)

			// Rasm ma'lumotlarini DB ga saqlash
			await applicationService.saveFile(applicationId, FileType.HALF_BODY, best.file_id, {
				cloudinaryUrl: uploaded.secureUrl,
				cloudinaryPublicId: uploaded.publicId,
				meta: {
					width: validated.width,
					height: validated.height,
					ratio: validated.ratio
				}
			})

			return {
				telegramFileId: best.file_id,
				cloudinaryUrl: uploaded.secureUrl,
				cloudinaryPublicId: uploaded.publicId,
				meta: {
					width: validated.width,
					height: validated.height,
					ratio: validated.ratio
				}
			}
		}
	}
}
