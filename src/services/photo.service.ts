import sharp from 'sharp'
import axios from 'axios'
import { v2 as cloudinary } from 'cloudinary'

import { env } from '../config/env'
import { logger } from '../utils/logger'
import { type BotContext } from '../bot/bot'

export type HalfBodyPhotoRules = {
	minWidth: number
	minHeight: number
	minRatio: number
	maxRatio: number
}

export type PhotoValidationOk = {
	ok: true
	width: number
	height: number
	ratio: number
	buffer: Buffer
}

export type PhotoValidationFail = {
	ok: false
	reason: string
}

export type PhotoValidationResult = PhotoValidationOk | PhotoValidationFail

cloudinary.config({
	cloud_name: env.CLOUDINARY_CLOUD_NAME,
	api_key: env.CLOUDINARY_API_KEY,
	api_secret: env.CLOUDINARY_API_SECRET
})

export class PhotoService {
	async validateTelegramPhoto(
		ctx: BotContext,
		telegramFileId: string,
		rules: HalfBodyPhotoRules
	): Promise<PhotoValidationResult> {
		try {
			const file = await ctx.api.getFile(telegramFileId)
			if (!file.file_path) {
				return { ok: false, reason: "Rasmni olishda xatolik. Qayta yuboring." }
			}
			const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`

			const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
			const buffer = Buffer.from(res.data)

			const meta = await sharp(buffer).metadata()
			const width = meta.width ?? 0
			const height = meta.height ?? 0
			if (width < rules.minWidth || height < rules.minHeight) {
				return {
					ok: false,
					reason: `Rasm sifati past. Kamida ${rules.minWidth}x${rules.minHeight} bo‘lsin.`
				}
			}
			if (height <= width) {
				return { ok: false, reason: "Rasm tik (portret) formatda bo‘lishi kerak." }
			}
			const ratio = width / height
			if (ratio < rules.minRatio || ratio > rules.maxRatio) {
				return { ok: false, reason: "Rasm nisbatlari mos emas. Belidan yuqori (tik) rasm yuboring." }
			}

			return { ok: true, width, height, ratio, buffer }
		} catch (err) {
			logger.error({ err }, 'Photo validation failed')
			return { ok: false, reason: "Rasmni tekshirishda xatolik. Qayta urinib ko‘ring." }
		}
	}

	async uploadBufferToCloudinary(
		buffer: Buffer
	): Promise<{ secureUrl: string; publicId: string }> {
		return new Promise((resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(
				{
					folder: 'telegram-reception-bot/half_body',
					resource_type: 'image',
					quality: 'auto',
					fetch_format: 'auto'
				},
				(error, result) => {
					if (error || !result) {
						reject(error ?? new Error('Cloudinary upload failed'))
						return
					}
					resolve({ secureUrl: result.secure_url, publicId: result.public_id })
				}
			)
			stream.end(buffer)
		})
	}
}

export const photoService = new PhotoService()
