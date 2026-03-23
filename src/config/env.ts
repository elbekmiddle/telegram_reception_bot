import { config } from 'dotenv'
import { z } from 'zod'

config()

const envSchema = z.object({
	// Bot
	BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
	ADMIN_CHAT_ID: z.string().transform(val => parseInt(val, 10)),
	ADMIN_CHAT_ID_2: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),

	// Database
	DATABASE_URL: z.string().url(),
	PG_POOL_MAX: z.string().default('10').transform(Number),
	PG_IDLE_TIMEOUT_MS: z.string().default('30000').transform(Number),
	PG_CONNECTION_TIMEOUT_MS: z.string().default('5000').transform(Number),
	PG_STATEMENT_TIMEOUT_MS: z.string().default('30000').transform(Number),

	// Redis (optional — falls back to in-memory)
	REDIS_URL: z.string().url().optional(),
	REDIS_HOST: z.string().default('localhost'),
	REDIS_PORT: z.string().default('6379'),
	REDIS_PASSWORD: z.string().optional(),
	REDIS_DB: z.string().default('0'),
	REDIS_PREFIX: z.string().default('tgbot'),

	// Rate limiting
	RATE_LIMIT_MAX: z.string().default('20').transform(Number),
	RATE_LIMIT_WINDOW_SEC: z.string().default('60').transform(Number),
	CALLBACK_DEDUPE_TTL_SEC: z.string().default('30').transform(Number),
	USER_SYNC_TTL_SEC: z.string().default('300').transform(Number),

	// Flow session
	FLOW_IDLE_TIMEOUT_DAYS: z.string().default('7').transform(Number),

	// Cloudinary
	CLOUDINARY_CLOUD_NAME: z.string().min(1),
	CLOUDINARY_API_KEY: z.string().min(1),
	CLOUDINARY_API_SECRET: z.string().min(1),

	// HTTP server
	PORT: z.string().default('4000').transform(Number),
	USE_WEBHOOK: z.string().optional().transform(v => v === 'true' || v === '1'),
	PUBLIC_BASE_URL: z.string().url().optional(),
	WEBHOOK_SECRET: z.string().default('secret'),

	// Contact info (displayed in /contact)
	CONTACT_PHONE: z.string().default(''),
	CONTACT_TELEGRAM: z.string().default(''),

	// App
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

const envParse = envSchema.safeParse(process.env)

if (!envParse.success) {
	console.error('❌ Invalid environment variables:', envParse.error.format())
	process.exit(1)
}

export const env = envParse.data

// getEnv() — used by new modules (returns same singleton)
export function getEnv() {
	return env
}

// Convenience alias: useWebhook mapped from USE_WEBHOOK
export type Env = typeof env & { useWebhook: boolean }
Object.defineProperty(env, 'useWebhook', { get: () => env.USE_WEBHOOK })
