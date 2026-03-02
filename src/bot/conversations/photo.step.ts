import { InlineKeyboard } from 'grammy'
import type { Conversation } from '@grammyjs/conversations'
import { type BotContext } from '../bot'
import { photoService, type HalfBodyPhotoRules } from '../../services/photo.service'
import { keyboards } from '../../utils/keyboards'
import { applicationService } from '../../services/application.service'
import { FileType } from '@prisma/client'
import { answerRepo } from '../../db/repositories/answer.repo'
import { AnswerFieldType } from '@prisma/client'
import { logger } from '../../utils/logger'

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

		// const sentMsg = await ctx.reply(
		// 	[
		// 		'📸 *Belidan yuqori rasm yuboring*',
		// 		'',
		// 		'✅ Talablar:',
		// 		"• Rasm *beldan yuqori qismi* bo'lishi kerak",
		// 		"• Yuzingiz aniq ko'rinsin",
		// 		'• Tik (portret) format',
		// 		`• Kamida ${rules.minWidth}x${rules.minHeight} piksel`,
		// 		"• Boshqa shaxslar bo'lmasligi kerak",
		// 		'',
		// 		'Rasmni yuboring:'
		// 	].join('\n'),
		// 	{ parse_mode: 'Markdown', reply_markup: kb }
		// )
		// photo.step.ts dagi xabar matnini o'zgartirish

		const sentMsg = await ctx.reply(
			[
				'📸 *Belidan yuqori rasm yuboring*',
				'',
				'✅ *Talablar:*',
				"• Rasm *beldan yuqori qismi* bo'lishi kerak",
				"• Yuzingiz aniq ko'rinsin",
				'• Tik (portret) format',
				`• Minimal o'lcham: ${rules.minWidth}x${rules.minHeight} piksel`,
				`• Maksimal o'lcham: 4000x4000 piksel`,
				"• Rasmda faqat siz bo'lishingiz kerak",
				"• Fon oddiy va bir xil bo'lishi tavsiya etiladi",
				'',
				"*Eslatma:* Rasm sifati past bo'lsa yoki juda katta bo'lsa, qayta yuborishingiz kerak bo'ladi.",
				'',
				'Rasmni yuboring:'
			].join('\n'),
			{ parse_mode: 'Markdown', reply_markup: kb }
		)
		lastMessageId = sentMsg.message_id

		while (true) {
			const u = await conversation.wait()

			if (u.callbackQuery) {
				const data = u.callbackQuery.data
				if (!data) continue

				// MUHIM: Callback query ni DARHOL answer qilish
				try {
					await u.answerCallbackQuery()
				} catch (err) {
					logger.warn({ err, userId: ctx.from?.id }, 'Failed to answer callback query in PhotoStep')
				}

				if (data === 'NAV|BACK') throw new Error('BACK')
				if (data === 'NAV|CANCEL') throw new Error('CANCEL')

				if (data === 'PHOTO|RULES') {
					// Qoidani ko'rsatish
					if (lastMessageId) {
						try {
							await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
						} catch (error) {
							// ignore
						}
					}

					const rulesMsg = await ctx.reply(
						[
							"📋 *To'g'ri / noto'g'ri misol:*",
							'',
							'✅ *TOʻGʻRI:*',
							'• Yuz yaqin, yelka/bel koʻrinadi',
							'• Fon oddiy va bir xil',
							'• Yorugʻlik yaxshi',
							'',
							'❌ *NOTOʻGʻRI:*',
							'• Pasport 3x4 rasmi',
							'• Juda uzoqdan olingan',
							'• Juda kichik yoki loyqa',
							'• Bir nechta odam',
							'',
							'Endi toʻgʻri rasm yuboring:'
						].join('\n'),
						{ parse_mode: 'Markdown', reply_markup: kb }
					)
					lastMessageId = rulesMsg.message_id
					continue
				}

				// Boshqa callback querylar ignore qilinadi
				continue
			}

			// Rasm tekshirish
			if (!u.message?.photo?.length) {
				// Rasm emas, boshqa narsa yuborilgan
				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (error) {
						// ignore
					}
				}

				const errorMsg = await ctx.reply('❌ Iltimos, rasmni *PHOTO* ko‘rinishida yuboring.', {
					parse_mode: 'Markdown',
					reply_markup: keyboards.photoRetryOrRules()
				})
				lastMessageId = errorMsg.message_id
				continue
			}

			// Rasmni validatsiya qilish
			const best = u.message.photo[u.message.photo.length - 1]
			const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, rules)

			if (!validated.ok) {
				// Rasm talablarga javob bermaydi
				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (error) {
						// ignore
					}
				}

				const errorMsg = await ctx.reply(`❌ *Xatolik:*\n${validated.reason}`, {
					parse_mode: 'Markdown',
					reply_markup: keyboards.photoRetryOrRules()
				})
				lastMessageId = errorMsg.message_id
				continue
			}

			// Rasmni Cloudinary ga yuklash
			try {
				// Rasm hashini hisoblash
				const newHash = await photoService.computeImageHash(validated.buffer)
				const oldHash = await answerRepo.getByKey(applicationId, 'photo_hash')

				if (oldHash?.fieldValue) {
					const dist = photoService.hammingDistance(oldHash.fieldValue, newHash)
					// juda katta farq bo'lsa - boshqa rasm deb hisoblaymiz
					if (dist > 10) {
						if (lastMessageId) {
							try {
								await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
							} catch (error) {
								// ignore
							}
						}
						const warn = await ctx.reply(
							"❗ Yuborgan rasmingiz avvalgi rasmingizga mos kelmadi. Iltimos, o'zingizning beldan yuqori rasmingizni yuboring.",
							{ parse_mode: 'Markdown', reply_markup: keyboards.photoRetryOrRules() }
						)
						lastMessageId = warn.message_id
						continue
					}
				}

				// Rasmni Cloudinary ga yuklash
				const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)

				// Rasm hashini saqlash
				await applicationService.saveAnswer(
					applicationId,
					'photo_hash',
					newHash,
					AnswerFieldType.TEXT
				)

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

				// Muvaffaqiyatli yuklandi
				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (error) {
						// ignore
					}
				}

				await ctx.reply('✅ Rasm muvaffaqiyatli qabul qilindi!', {
					parse_mode: 'Markdown'
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
			} catch (error) {
				logger.error({ error, applicationId }, 'Failed to upload photo to Cloudinary')

				if (lastMessageId) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
					} catch (err) {
						// ignore
					}
				}

				const errorMsg = await ctx.reply(
					'❌ Rasmni yuklashda xatolik yuz berdi. Qayta urinib koʻring.',
					{ parse_mode: 'Markdown', reply_markup: keyboards.photoRetryOrRules() }
				)
				lastMessageId = errorMsg.message_id
				continue
			}
		}
	}
}
