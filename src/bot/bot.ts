import { Bot, Context as GrammyContext, type MiddlewareFn } from 'grammy'
import { conversations, createConversation, type ConversationFlavor } from '@grammyjs/conversations'
import { type SessionFlavor } from 'grammy'
import express, { Request, Response } from 'express'

import { env } from '../config/env'
import { logger } from '../utils/logger'
import { sessionMiddleware } from './middlewares/session'
import { authMiddleware } from './middlewares/auth'
import { rateLimitMiddleware } from './middlewares/rateLimit'
import { updateDedupeMiddleware } from './middlewares/updateDedupe'
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
import { runtimeSettingsService } from '../services/runtime-settings.service'

export type BotContext = GrammyContext &
	SessionFlavor<SessionData> &
	ConversationFlavor & { state: { correlationId?: string } }

const stateMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
	;(ctx as unknown as { state?: { correlationId?: string } }).state ??= {}
	ctx.state.correlationId = `upd-${ctx.update.update_id}`
	await next()
}

export const bot = new Bot<BotContext>(env.BOT_TOKEN)
setDirectBot(bot)

let botInfoCache: UserFromGetMe | null = null
let healthServerStarted = false
let updatesStarted = false

bot.use(stateMiddleware)
bot.use(sessionMiddleware)
bot.use(conversations())

bot.use(createConversation(applicationFlow, 'applicationFlow'))
bot.use(createConversation(adminFlow, 'adminFlow'))
bot.use(createConversation(courseFlow, 'courseFlow'))

bot.use(updateDedupeMiddleware)
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
	await ctx
		.answerCallbackQuery({
			text: 'Bu tugma eskirgan. /start ni bosing yoki yangi tugmalardan foydalaning.',
			show_alert: false
		})
		.catch(() => {})
})

bot.catch(err => {
	logger.error({ err }, 'Unhandled bot error')
})

const app = express()
app.use(express.json({ limit: '512kb' }))

app.get('/health', (_req: Request, res: Response) => {
	res.status(200).json({
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		botInitialized: botInfoCache !== null,
		updatesStarted
	})
})

app.get('/ready', (_req: Request, res: Response) => {
	const ready = botInfoCache !== null && updatesStarted
	res.status(ready ? 200 : 503).json({ status: ready ? 'READY' : 'NOT_READY' })
})

app.get('/live', (_req: Request, res: Response) => {
	res.status(200).json({ status: 'ALIVE' })
})

app.get('/metrics', (_req: Request, res: Response) => {
	res.status(200).json({
		uptime: process.uptime(),
		memoryUsage: process.memoryUsage(),
		cpuUsage: process.cpuUsage()
	})
})

function startHttpServer(): void {
	if (healthServerStarted) return
	app.listen(env.PORT, () => {
		logger.info(`HTTP server listening on :${env.PORT}`)
	})
	healthServerStarted = true
}

async function startWebhookMode(): Promise<void> {
	if (!env.WEBHOOK_URL) {
		throw new Error('WEBHOOK_URL is required in webhook mode')
	}

	app.post(env.WEBHOOK_PATH, async (req: Request, res: Response) => {
		if (env.WEBHOOK_SECRET_TOKEN) {
			const header = req.header('x-telegram-bot-api-secret-token')
			if (header !== env.WEBHOOK_SECRET_TOKEN) {
				res.status(401).json({ ok: false })
				return
			}
		}

		try {
			await bot.handleUpdate(req.body)
			res.status(200).json({ ok: true })
		} catch (error) {
			logger.error({ error }, 'Webhook update processing failed')
			res.status(500).json({ ok: false })
		}
	})

	await bot.api.setWebhook(`${env.WEBHOOK_URL}${env.WEBHOOK_PATH}`, {
		secret_token: env.WEBHOOK_SECRET_TOKEN,
		drop_pending_updates: false,
		allowed_updates: ['message', 'callback_query']
	})

	updatesStarted = true
	logger.info({ url: `${env.WEBHOOK_URL}${env.WEBHOOK_PATH}` }, 'Webhook mode enabled')
}

async function startPollingMode(): Promise<void> {
	await bot.api.deleteWebhook({ drop_pending_updates: false })
	await bot.start({
		onStart: info => {
			updatesStarted = true
			logger.info({ username: info.username }, 'Polling mode enabled')
		}
	})
}

export async function startBot(): Promise<void> {
	startHttpServer()
	await runtimeSettingsService.initialize()
	await bot.init()
	botInfoCache = bot.botInfo
	logger.info({ username: bot.botInfo.username }, 'Bot initialized')

	if (env.USE_WEBHOOK) {
		await startWebhookMode()
	} else {
		await startPollingMode()
	}
}

async function shutdown(signal: string): Promise<void> {
	logger.info({ signal }, 'Shutdown signal received')
	await bot.stop()
	process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
