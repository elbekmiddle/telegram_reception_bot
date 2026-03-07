import { Bot, Context as GrammyContext, type MiddlewareFn } from 'grammy'
import { conversations, createConversation, type ConversationFlavor } from '@grammyjs/conversations'
import { type SessionFlavor } from 'grammy'
import express, { Request, Response } from 'express'
import { sequentialize } from '@grammyjs/runner'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { sessionMiddleware } from './middlewares/session'
import { authMiddleware } from './middlewares/auth'
import { rateLimitMiddleware } from './middlewares/rateLimit'
import { setupCommands } from './commands'
import { setupHandlers } from './handlers'
import { setupAdminHandlers } from './handlers/admin'
import { applicationFlow } from './conversations/application.flow'
import { adminFlow } from './conversations/admin.flow'
import { courseFlow } from './conversations/course.flow'
import { handleStartChoice } from './start.menu'
import type { SessionData } from '../types/session'
import { setDirectBot } from './conversations/direct-api'

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

// MUHIM ORDER:
// 1. State
// 2. Session
// 3. Sequentialize (ENG MUHIM!)
// 4. Conversations
// 5. Rate limit
// 6. Auth
// 7. Commands va Handlers

bot.use(stateMiddleware)
bot.use(sessionMiddleware)

// Sequentialize middleware - BIR CHAT UCHUN UPDATE'LARNI KETMA-KET ISHLAYDI
bot.use(
	sequentialize((ctx: BotContext) => {
		// Har bir chat/user uchun unique key
		const key = String(ctx.chat?.id ?? ctx.from?.id ?? ctx.update.update_id)
		logger.debug({ key }, 'Sequentialize key')
		return key
	})
)

// Conversations plugin
bot.use(conversations())

// Conversationlarni register qilish
bot.use(createConversation(applicationFlow, 'applicationFlow'))
bot.use(createConversation(adminFlow, 'adminFlow'))
bot.use(createConversation(courseFlow, 'courseFlow'))

// Rate limit - callbacklarni o'tkazib yuborish uchun
bot.use(rateLimitMiddleware)

// Auth middleware
bot.use(authMiddleware)

// Commands va handlers eng oxirida
setupCommands(bot)
setupHandlers(bot)

// Start menu buttons (Vacancy / Courses)
bot.callbackQuery(/^START\|(VAC|COURSE)$/, handleStartChoice)
setupAdminHandlers(bot)

bot.catch(err => {
	logger.error({ err }, 'Unhandled bot error')
})

// Health check server
const app = express()
const PORT = process.env.PORT || '4000'

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
	const healthcheck = {
		status: 'OK',
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		bot: {
			status: 'running',
			username: bot.botInfo?.username || 'unknown',
			id: bot.botInfo?.id || 'unknown'
		},
		environment: env.NODE_ENV,
		version: process.version,
		memory: process.memoryUsage()
	}

	try {
		res.status(200).json(healthcheck)
	} catch (error) {
		healthcheck.status = 'ERROR'
		res.status(503).json(healthcheck)
	}
})

// Readiness check endpoint
app.get('/ready', (_req: Request, res: Response) => {
	res.status(200).json({
		status: 'READY',
		timestamp: new Date().toISOString(),
		bot: {
			status: 'ready',
			username: bot.botInfo?.username || null
		}
	})
})

// Liveness check endpoint
app.get('/live', (_req: Request, res: Response) => {
	res.status(200).json({
		status: 'ALIVE',
		timestamp: new Date().toISOString()
	})
})

// Metrics endpoint (opsiyonel)
app.get('/metrics', (_req: Request, res: Response) => {
	res.status(200).json({
		uptime: process.uptime(),
		memoryUsage: process.memoryUsage(),
		cpuUsage: process.cpuUsage(),
		botStats: {
			startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
			botUsername: bot.botInfo?.username,
			botId: bot.botInfo?.id
		}
	})
})

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
	res.status(200).json({
		message: 'Telegram Reception Bot API',
		version: '1.0.0',
		endpoints: {
			health: '/health',
			ready: '/ready',
			live: '/live',
			metrics: '/metrics'
		},
		bot: {
			username: bot.botInfo?.username,
			status: 'running'
		}
	})
})

export async function startBot(): Promise<void> {
	try {
		// Health serverini ishga tushirish
		app.listen(PORT, () => {
			logger.info(`✅ Health server running on port ${PORT}`)
			logger.info(`   Health endpoint: http://localhost:${PORT}/health`)
			logger.info(`   Ready endpoint: http://localhost:${PORT}/ready`)
			logger.info(`   Live endpoint: http://localhost:${PORT}/live`)
			logger.info(`   Metrics endpoint: http://localhost:${PORT}/metrics`)
		})

		// Botni ishga tushirish
		await bot.start({
			onStart: info => {
				logger.info(
					env.NODE_ENV === 'development'
						? `✅ Bot started (polling): @${info.username}`
						: `✅ Bot started (polling/prod): @${info.username}`
				)
			}
		})
	} catch (error) {
		logger.error({ error }, 'Failed to start bot')
		process.exit(1)
	}
}

// Graceful shutdown
process.on('SIGTERM', async () => {
	logger.info('SIGTERM received, shutting down gracefully...')
	await bot.stop()
	process.exit(0)
})

process.on('SIGINT', async () => {
	logger.info('SIGINT received, shutting down gracefully...')
	await bot.stop()
	process.exit(0)
})
