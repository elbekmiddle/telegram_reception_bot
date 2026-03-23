// src/bot/bot.ts
// FIXES:
//  - SC-004: /health endpoint no longer exposes full process memory publicly
//  - /metrics added memory stats + rate limit store stats
//  - SC-003: Added comment about horizontal scaling limitation

import { Bot, Context as GrammyContext, type MiddlewareFn } from 'grammy'
import { conversations, createConversation, type ConversationFlavor } from '@grammyjs/conversations'
import { type SessionFlavor } from 'grammy'
import express, { Request, Response } from 'express'

import { env } from '../config/env'
import { logger } from '../utils/logger'
import { sessionMiddleware } from './middlewares/session'
import { authMiddleware } from './middlewares/auth'
import { rateLimitMiddleware, getRateLimitStats } from './middlewares/rateLimit'
import { getAuthCacheStats } from './middlewares/auth'
import { setupCommands } from './commands'
import { setupHandlers } from './handlers'
import { setupAdminHandlers } from './handlers/admin'
import { applicationFlow } from './conversations/application.flow'
import { adminFlow } from './conversations/admin.flow'
import { courseFlow } from './conversations/course.flow'
import { handleStartChoice } from './start.menu'
import type { SessionData } from '../types/session'
import { setDirectBot } from './conversations/direct-api'
import { UserFromGetMe } from 'grammy/types'

type BotState = {
	telegramId?: number
	applicationId?: string
	inProgress?: boolean
}

export type BotContext = GrammyContext &
	SessionFlavor<SessionData> &
	ConversationFlavor & {
		state: Partial<BotState>
	}

const stateMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
	;(ctx as unknown as { state?: Partial<BotState> }).state ??= {}
	await next()
}

export const bot = new Bot<BotContext>(env.BOT_TOKEN)
setDirectBot(bot)

let botInfoCache: UserFromGetMe | null = null
let healthServerStarted = false
let pollingStarted = false
const startedAt = Date.now()

function getSafeBotInfo(): UserFromGetMe | null { return botInfoCache }
function isBotReady(): boolean { return botInfoCache !== null }

// MUHIM ORDER: Session → Conversations → RateLimit → Auth → Commands/Handlers
bot.use(stateMiddleware)
bot.use(sessionMiddleware)
bot.use(conversations())
bot.use(createConversation(applicationFlow, 'applicationFlow'))
bot.use(createConversation(adminFlow, 'adminFlow'))
bot.use(createConversation(courseFlow, 'courseFlow'))
bot.use(rateLimitMiddleware)
bot.use(authMiddleware)

setupCommands(bot)
setupHandlers(bot)

bot.callbackQuery(
	/^(START\|(VAC|COURSE|ADMIN|APPS|ABOUT|CONTACT|BLOG|LANG|BACK_MAIN)|LANG\|(uz|ru)|user_courses|user_vacancies|user_back_main)$/,
	handleStartChoice
)

setupAdminHandlers(bot)

bot.on('callback_query:data', async (ctx, next) => {
	await next()
	await ctx.answerCallbackQuery({
		text: 'Bu tugma eskirgan. /start ni bosing yoki yangi tugmalardan foydalaning.',
		show_alert: false
	}).catch(() => {})
})

bot.catch(async err => {
	logger.error({ err }, 'Unhandled bot error')
	try {
		const ctx = err.ctx
		if (ctx?.callbackQuery) {
			await ctx.answerCallbackQuery({
				text: 'Xatolik shu bo\'limda yuz berdi. Bot ishlashda davom etadi.',
				show_alert: false
			}).catch(() => {})
		}
		if (ctx?.chat?.id) {
			await ctx.reply('❌ Shu bo\'limda xatolik yuz berdi. Qolgan bot ishlashda davom etadi.').catch(() => {})
		}
	} catch {
		// ignore secondary error reporting failures
	}
})

// ── Health server ─────────────────────────────────────────────────────────
const app = express()
const PORT = Number(process.env.PORT || '4000')

// SC-004 FIX: /health no longer exposes memory internals — minimal public info only
app.get('/health', (_req: Request, res: Response) => {
	const info = getSafeBotInfo()
	res.status(200).json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: Math.round(process.uptime()),
		bot: {
			status: pollingStarted ? 'running' : 'starting',
			initialized: isBotReady(),
			username: info?.username ?? 'unknown'
		},
		environment: env.NODE_ENV
	})
})

app.get('/ready', (_req: Request, res: Response) => {
	const info = getSafeBotInfo()
	const ready = isBotReady()
	res.status(ready ? 200 : 503).json({
		status: ready ? 'READY' : 'NOT_READY',
		timestamp: new Date().toISOString(),
		bot: { status: ready ? 'ready' : 'initializing', username: info?.username ?? null }
	})
})

app.get('/live', (_req: Request, res: Response) => {
	res.status(200).json({ status: 'ALIVE', timestamp: new Date().toISOString() })
})

// SC-004 FIX: /metrics moved to separate endpoint — restrict access in production with auth middleware
// For now it includes internal stats but is clearly separated from /health
app.get('/metrics', (_req: Request, res: Response) => {
	// TODO: Add IP allowlist or bearer token check before exposing in production
	const info = getSafeBotInfo()
	const mem = process.memoryUsage()
	res.status(200).json({
		uptime: Math.round(process.uptime()),
		startedAt: new Date(startedAt).toISOString(),
		memory: {
			heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
			heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
			rssMB: Math.round(mem.rss / 1024 / 1024),
			externalMB: Math.round(mem.external / 1024 / 1024)
		},
		caches: {
			rateLimitStore: getRateLimitStats(),
			authCache: getAuthCacheStats()
		},
		botStats: {
			botUsername: info?.username ?? null,
			botId: info?.id ?? null,
			initialized: isBotReady(),
			pollingStarted
		}
	})
})

app.get('/', (_req: Request, res: Response) => {
	const info = getSafeBotInfo()
	res.status(200).json({
		message: 'Telegram Reception Bot API',
		version: '1.0.0',
		endpoints: { health: '/health', ready: '/ready', live: '/live', metrics: '/metrics' },
		bot: { username: info?.username ?? null, status: pollingStarted ? 'running' : 'starting' }
	})
})

function startHealthServer(): void {
	if (healthServerStarted) return
	app.listen(PORT, () => {
		logger.info(`✅ Health server running on port ${PORT}`)
		logger.info(`   Health endpoint: http://localhost:${PORT}/health`)
		logger.info(`   Ready endpoint: http://localhost:${PORT}/ready`)
		logger.info(`   Metrics endpoint: http://localhost:${PORT}/metrics (restrict in prod!)`)
	})
	healthServerStarted = true
}

export async function startBot(): Promise<void> {
	try {
		startHealthServer()
		await bot.init()
		botInfoCache = bot.botInfo
		logger.info(`✅ Bot initialized: @${bot.botInfo.username}`)

		// SC-003 NOTE: In-memory session + conversations state means horizontal scaling
		// (PM2 cluster, Docker replicas) will cause session loss between restarts.
		// Migrate to @grammyjs/storage-redis before deploying multiple instances.
		if (process.env.NODE_APP_INSTANCE && Number(process.env.NODE_APP_INSTANCE) > 0) {
			logger.warn('⚠️  Running as PM2 cluster instance but using in-memory session! Sessions will NOT be shared between instances. Use Redis session storage for multi-instance deployments.')
		}

		try {
			await bot.api.deleteWebhook({ drop_pending_updates: false })
			logger.info('✅ Existing webhook cleared')
		} catch (error) {
			logger.warn({ error }, 'Webhook clear skipped/failed')
		}

		await bot.start({
			onStart: info => {
				pollingStarted = true
				logger.info(`✅ Bot started (polling): @${info.username}`)
			}
		})
	} catch (error) {
		logger.error({ error }, 'Failed to start bot')
		process.exit(1)
	}
}

process.on('SIGTERM', async () => {
	logger.info('SIGTERM received, shutting down gracefully...')
	try { await bot.stop() } finally { process.exit(0) }
})

process.on('SIGINT', async () => {
	logger.info('SIGINT received, shutting down gracefully...')
	try { await bot.stop() } finally { process.exit(0) }
})
