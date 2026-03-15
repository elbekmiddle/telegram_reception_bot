import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
	BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
	ADMIN_CHAT_ID: z.string().transform(val => Number.parseInt(val, 10)),
	DATABASE_URL: z.string().url(),


	CLOUDINARY_CLOUD_NAME: z.string().min(1),
	CLOUDINARY_API_KEY: z.string().min(1),
	CLOUDINARY_API_SECRET: z.string().min(1),

	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

	PORT: z.coerce.number().default(4000),
	USE_WEBHOOK: z
		.string()
		.optional()
		.transform(val => val === 'true'),
	WEBHOOK_URL: z.string().url().optional(),
	WEBHOOK_PATH: z.string().default('/telegram/webhook'),
	WEBHOOK_SECRET_TOKEN: z.string().optional(),

	PG_POOL_MIN: z.coerce.number().default(5),
	PG_POOL_MAX: z.coerce.number().default(50),
	PG_POOL_MAX_USES: z.coerce.number().default(7500),
	PG_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
	PG_CONNECTION_TIMEOUT_MS: z.coerce.number().default(10000),
	PG_QUERY_TIMEOUT_MS: z.coerce.number().default(8000),
	RATE_LIMIT_WINDOW_MS: z.coerce.number().default(5000),
	RATE_LIMIT_MAX: z.coerce.number().default(20)
})

const envParse = envSchema.safeParse(process.env)

if (!envParse.success) {
	console.error('❌ Invalid environment variables:', envParse.error.format())
	process.exit(1)
}

const parsed = envParse.data
if (parsed.USE_WEBHOOK && !parsed.WEBHOOK_URL) {
	console.error('❌ WEBHOOK_URL is required when USE_WEBHOOK=true')
	process.exit(1)
}

export const env = parsed
