import sharp from 'sharp'
import axios from 'axios'
import { v2 as cloudinary } from 'cloudinary'
import path from 'path'
import fs from 'fs'

import { env } from '../config/env'
import { logger } from '../utils/logger'
import { type BotContext } from '../bot/bot'

export type HalfBodyPhotoRules = {
	minWidth: number
	minHeight: number
	minRatio: number
	maxRatio: number
	maxWidth?: number
	maxHeight?: number
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
				return { ok: false, reason: 'Rasmni olishda xatolik. Qayta yuboring.' }
			}
			
			// TO'G'RI: Telegram API orqali yuklanadi
			const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`

			const res = await axios.get(url, { responseType: 'arraybuffer' })
			const buffer = Buffer.from(res.data)

			const meta = await sharp(buffer).metadata()
			const width = meta.width ?? 0
			const height = meta.height ?? 0

			// Cheklovlarni olib tashlaymiz: faqat rasm borligini va metadata o'qilishini tekshiramiz.
			// Face tekshiruv Cloudinary upload bosqichida qilinadi.
			const ratio = height > 0 ? width / height : 0
			return { ok: true, width, height, ratio, buffer }
		} catch (err) {
			logger.error({ err }, 'Photo validation failed')
			return { ok: false, reason: "Rasmni tekshirishda xatolik. Qayta urinib ko'ring." }
		}
	}

	/**
	 * Get demo photo buffer from local file system
	 * YANGI: Demo rasm uchun alohida method
	 */
	async getDemoPhotoBuffer(): Promise<Buffer | null> {
		try {
			// Try multiple possible paths
			const possiblePaths = [
				path.join(process.cwd(), 'assets', 'half_body_example.jpg'),
				path.join(process.cwd(), 'src', 'assets', 'half_body_example.jpg'),
				path.join(process.cwd(), 'public', 'demo', 'photo.jpg'),
				path.join(__dirname, '..', '..', 'assets', 'half_body_example.jpg')
			]

			for (const filePath of possiblePaths) {
				if (fs.existsSync(filePath)) {
					logger.info({ filePath }, 'Found demo photo')
					return fs.readFileSync(filePath)
				}
			}

			logger.warn('Demo photo file not found in any expected location')
			return null
		} catch (err) {
			logger.error({ err }, 'Failed to read demo photo')
			return null
		}
	}

	async uploadBufferToCloudinary(
		buffer: Buffer
	): Promise<{ secureUrl: string; publicId: string; faces: Array<{ x: number; y: number; w: number; h: number }> }> {
		return new Promise((resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(
				{
					folder: 'telegram-reception-bot/half_body',
					resource_type: 'image',
					quality: 'auto',
					fetch_format: 'auto',
					faces: true
				},
				(error, result) => {
					if (error || !result) {
						reject(error ?? new Error('Cloudinary upload failed'))
						return
					}
					const faces = ((result as any).faces as Array<{ x: number; y: number; w: number; h: number }>) ?? []
					resolve({ secureUrl: (result as any).secure_url, publicId: (result as any).public_id, faces })
				}
			)
			stream.end(buffer)
		})
	}

	/**
	 * Oddiy 'average hash' (aHash) - serverda tez tekshirish uchun.
	 * Bu yuzni 100% aniqlamaydi, lekin butunlay boshqa rasm yuborishni kamaytiradi.
	 */
	async computeImageHash(buffer: Buffer): Promise<string> {
		const size = 8
		const img = sharp(buffer).resize(size, size, { fit: 'fill' }).grayscale()
		const { data } = await img.raw().toBuffer({ resolveWithObject: true })
		const pixels = Array.from(data as Uint8Array) as number[]
		const avg = pixels.reduce((a: number, b: number) => a + b, 0) / pixels.length
		let bits = ''
		for (const p of pixels) bits += p >= avg ? '1' : '0'
		let hex = ''
		for (let i = 0; i < bits.length; i += 4) {
			hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
		}
		return hex
	}

	hammingDistance(hexA: string, hexB: string): number {
		if (hexA.length !== hexB.length) return Number.MAX_SAFE_INTEGER
		let dist = 0
		for (let i = 0; i < hexA.length; i++) {
			const a = parseInt(hexA[i], 16)
			const b = parseInt(hexB[i], 16)
			let x = a ^ b
			while (x) {
				dist += x & 1
				x >>= 1
			}
		}
		return dist
	}
}

export const photoService = new PhotoService()