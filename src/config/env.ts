import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
	// Bot
	BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
	ADMIN_CHAT_ID: z.string().transform(val => parseInt(val, 10)),

	// Database
	DATABASE_URL: z.string().url(),

	// Redis (optional)
	REDIS_URL: z.string().url().optional(),

	// Cloudinary
	CLOUDINARY_CLOUD_NAME: z.string().min(1),
	CLOUDINARY_API_KEY: z.string().min(1),
	CLOUDINARY_API_SECRET: z.string().min(1),

	// App
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
})

const envParse = envSchema.safeParse(process.env)

if (!envParse.success) {
	console.error('❌ Invalid environment variables:', envParse.error.format())
	process.exit(1)
}

export const env = envParse.data
