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
	// Yangi parametrlar - minimal va maksimal o'lchamlar
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
			const url = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`

			const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' })
			const buffer = Buffer.from(res.data)

			const meta = await sharp(buffer).metadata()
			const width = meta.width ?? 0
			const height = meta.height ?? 0

			// Minimal o'lcham tekshiruvi (agar juda kichik bo'lsa)
			if (width < rules.minWidth || height < rules.minHeight) {
				return {
					ok: false,
					reason: `Rasm sifati past. Minimal o'lcham ${rules.minWidth}x${rules.minHeight} bo'lishi kerak. Hozirgi: ${width}x${height}`
				}
			}

			// Maksimal o'lcham tekshiruvi (agar juda katta bo'lsa - 4K dan katta)
			const MAX_WIDTH = 4000
			const MAX_HEIGHT = 4000
			if (width > MAX_WIDTH || height > MAX_HEIGHT) {
				return {
					ok: false,
					reason: `Rasm juda katta. Maksimal o'lcham ${MAX_WIDTH}x${MAX_HEIGHT} bo'lishi kerak. Hozirgi: ${width}x${height}`
				}
			}

			// Portret format tekshiruvi (bo'yi enidan katta bo'lishi kerak)
			if (height <= width) {
				return {
					ok: false,
					reason:
						"Rasm tik (portret) formatda bo'lishi kerak (bo'yi enidan katta). Iltimos, vertikal rasm yuboring."
				}
			}

			// Nisbat tekshiruvi (half body uchun taxminan 0.6 - 0.9 oralig'i)
			const ratio = width / height
			if (ratio < rules.minRatio || ratio > rules.maxRatio) {
				return {
					ok: false,
					reason: `Rasm nisbatlari mos emas. Belidan yuqori (tik) rasm yuboring. Optimal nisbat 0.7-0.85 atrofida. Hozirgi: ${ratio.toFixed(
						2
					)}`
				}
			}

			// Rasmda yuz bor-yo'qligini tekshirish (oddiy tekshiruv)
			// Bu yerda face detection qo'shish mumkin, lekin hozircha o'tkazib yuboramiz

			return { ok: true, width, height, ratio, buffer }
		} catch (err) {
			logger.error({ err }, 'Photo validation failed')
			return { ok: false, reason: "Rasmni tekshirishda xatolik. Qayta urinib ko'ring." }
		}
	}

	async uploadBufferToCloudinary(buffer: Buffer): Promise<{ secureUrl: string; publicId: string }> {
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

	/**
	 * Oddiy 'average hash' (aHash) - serverda tez tekshirish uchun.
	 * Bu yuzni 100% aniqlamaydi, lekin butunlay boshqa rasm yuborishni kamaytiradi.
	 */
	async computeImageHash(buffer: Buffer): Promise<string> {
		const size = 8
		const img = sharp(buffer).resize(size, size, { fit: 'fill' }).grayscale()
		const { data } = await img.raw().toBuffer({ resolveWithObject: true })
		const pixels = Array.from(data)
		const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length
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
