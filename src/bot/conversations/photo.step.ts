import { Context } from '../bot'
import { InlineKeyboard } from 'grammy'
import { PhotoRules, CallbackData } from '../../config/constants'
import { photoService } from '../../services/photo.service'
import { logger } from '../../utils/logger'

export class PhotoStep {
	static async handle(ctx: Context): Promise<string> {
		const keyboard = new InlineKeyboard()
			.text("📸 Qoidani ko'rsat", CallbackData.PHOTO_RULES)
			.row()
			.text('⬅️ Orqaga', CallbackData.NAV_BACK)
			.text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

		// Qoidani tushuntirish
		await ctx.reply(
			'📸 *Belidan yuqori rasm yuboring*\n\n' +
				"✅ *To'g'ri misol:*\n" +
				"• Yuz aniq ko'rinishi kerak\n" +
				"• Fon oddiy bo'lishi kerak\n" +
				'• Rasm tik formatda (enidan balandligi katta)\n' +
				'• Kamida 800x1000 piksel\n\n' +
				"❌ *Noto'g'ri misol:*\n" +
				'• Pasport 3x4 skan qilmang\n' +
				"• To'liq gavda rasm emas\n" +
				'• Juda kichik yoki loyqa rasm\n\n' +
				'Rasmni yuboring:',
			{
				parse_mode: 'Markdown',
				reply_markup: keyboard
			}
		)

		while (true) {
			const response = await ctx.conversation.wait()

			// Callback query bo'lsa
			if (response.callbackQuery) {
				await response.answerCallbackQuery()
				const data = response.callbackQuery.data

				if (data === CallbackData.NAV_BACK) {
					throw new Error('BACK')
				}
				if (data === CallbackData.NAV_CANCEL) {
					throw new Error('CANCEL')
				}
				if (data === CallbackData.PHOTO_RULES) {
					await this.showRules(ctx)
					continue
				}
			}

			// Rasm tekshirish
			if (response.message?.photo) {
				const validation = await photoService.validateHalfBodyPhoto(response)

				if (!validation.ok) {
					const retryKeyboard = new InlineKeyboard()
						.text('🔄 Qayta yuborish', CallbackData.PHOTO_RETRY)
						.text("📸 Qoidani ko'rsat", CallbackData.PHOTO_RULES)

					await ctx.reply(validation.reason || "Rasm mos kelmadi. Qayta urinib ko'ring.", {
						reply_markup: retryKeyboard
					})
					continue
				}

				// Rasmni saqlash
				try {
					const fileId = response.message.photo[response.message.photo.length - 1].file_id

					// Cloudinary'ga yuklash
					const photoUrl = await photoService.uploadToCloudinary(ctx, fileId)

					// File ID ni qaytarish
					return fileId
				} catch (error) {
					logger.error({ error }, 'Photo upload failed')
					await ctx.reply("Rasmni saqlashda xatolik. Iltimos, qayta urinib ko'ring.")
					continue
				}
			}

			await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan birini tanlang.')
		}
	}

	private static async showRules(ctx: Context) {
		// To'g'ri va noto'g'ri misollarni ko'rsatish
		await ctx.reply(
			'📸 *QOIDA: Belidan yuqori rasm*\n\n' +
				"🔹 *TO'G'RI:*\n" +
				'• Yuz va yelka qismi aniq\n' +
				'• Fon oddiy (devor yoki bir xil rang)\n' +
				"• Rasm aniq va yorug'\n" +
				'• Portret formatda\n\n' +
				"🔸 *NOTO'G'RI:*\n" +
				'• Pasport 3x4 skan\n' +
				"• To'liq gavda (oyoqdan boshgacha)\n" +
				'• Juda kichkina rasm\n' +
				'• Guruhda tushgan rasm\n' +
				'• Filtr qilingan yoki yuzi berkitilgan\n\n' +
				"Endi to'g'ri rasm yuboring:",
			{ parse_mode: 'Markdown' }
		)
	}
}
