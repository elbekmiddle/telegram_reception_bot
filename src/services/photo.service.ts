import { Context } from '../bot'
import sharp from 'sharp'
import { PhotoRules } from '../config/constants'
import { PhotoValidationResult } from '../types/domain'
import { logger } from '../utils/logger'
import axios from 'axios'
import { v2 as cloudinary } from 'cloudinary'
import { env } from '../config/env'

// Cloudinary config
cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME,
	api_key: env.CLOUDINARY_API_KEY,
	api_secret: env.CLOUDINARY_API_SECRET
})

export class PhotoService {
	async validateHalfBodyPhoto(ctx: Context): Promise<PhotoValidationResult> {
		try {
			const photos = ctx.message?.photo
			if (!photos?.length) {
				return { ok: false, reason: "Iltimos, rasmni PHOTO ko'rinishida yuboring." }
			}

			// Eng katta rasmni olish
			const best = photos[photos.length - 1]
			const file = await ctx.api.getFile(best.file_id)
			const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`

			const response = await axios.get(url, { responseType: 'arraybuffer' })
			const buffer = Buffer.from(response.data)

			const metadata = await sharp(buffer).metadata()
			const width = metadata.width || 0
			const height = metadata.height || 0

			// Minimal o'lcham tekshirish
			if (width < PhotoRules.MIN_WIDTH || height < PhotoRules.MIN_HEIGHT) {
				return {
					ok: false,
					reason: `Rasm sifati past. Kamida ${PhotoRules.MIN_WIDTH}x${PhotoRules.MIN_HEIGHT} piksel bo'lishi kerak.`
				}
			}

			// Portret format tekshirish
			if (height <= width) {
				return {
					ok: false,
					reason: "Rasm portret (tik) formatda bo'lishi kerak. Enidan balandligi katta bo'lsin."
				}
			}

			// Nisbat tekshirish (3x4 ga yaqin)
			const ratio = width / height
			if (ratio < PhotoRules.MIN_RATIO || ratio > PhotoRules.MAX_RATIO) {
				return {
					ok: false,
					reason:
						"Rasm nisbatlari mos emas. 3x4 formatga yaqin bo'lishi kerak (belidan yuqori rasm)."
				}
			}

			// Rasmda yuz borligini tekshirish (oddiy brightness tekshiruvi)
			const stats = await sharp(buffer).stats()
			const avgBrightness = stats.channels[0].mean // Red channel as brightness proxy

			if (avgBrightness < 20) {
				return {
					ok: false,
					reason: "Rasm juda qorong'i. Yaxshiroq yorug'likda rasm yuboring."
				}
			}

			return {
				ok: true,
				width,
				height,
				buffer
			}
		} catch (error) {
			logger.error({ error }, 'Photo validation error')
			return {
				ok: false,
				reason: "Rasmni tekshirishda xatolik. Iltimos, qayta urinib ko'ring."
			}
		}
	}

	async uploadToCloudinary(ctx: Context, fileId: string): Promise<string> {
		try {
			const file = await ctx.api.getFile(fileId)
			const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`

			// Cloudinary'ga yuklash
			const result = await cloudinary.uploader.upload(url, {
				folder: 'reception_bot/photos',
				transformation: [{ width: 800, height: 1000, crop: 'limit' }, { quality: 'auto' }]
			})

			logger.info({ fileId, publicId: result.public_id }, 'Photo uploaded to Cloudinary')
			return result.secure_url
		} catch (error) {
			logger.error({ error, fileId }, 'Cloudinary upload failed')
			throw error
		}
	}

	async getPhotoUrl(fileId: string): Promise<string> {
		// Telegram dan to'g'ridan-to'g'ri URL qaytarish
		return `https://api.telegram.org/file/bot${env.BOT_TOKEN}/`
	}
}

export const photoService = new PhotoService()
