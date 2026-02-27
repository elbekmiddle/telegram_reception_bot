import { Bot as GrammyBot, Context as GrammyContext } from 'grammy'
import { conversations, createConversation } from '@grammyjs/conversations'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import { session } from './middlewares/session'
import { authMiddleware } from './middlewares/auth'
import { rateLimitMiddleware } from './middlewares/rateLimit'
import { setupCommands } from './commands'
import { setupHandlers } from './handlers'
import { applicationFlow } from './conversations/application.flow'
import { SessionData } from '../types/session'
import { Application } from '@prisma/client'

export type Context = GrammyContext & {
	session: SessionData
	conversations: {
		enter: (name: string) => Promise<void>
		exit: () => Promise<void>
	}
	state: {
		telegramId?: number
		application?: Application | null
	}
}

export const bot = new GrammyBot<Context>(env.BOT_TOKEN)

// Setup middleware
bot.use(session)
bot.use(rateLimitMiddleware)
bot.use(authMiddleware)
bot.use(conversations())
bot.use(createConversation(applicationFlow, 'applicationFlow'))

// Setup commands and handlers
setupCommands(bot)
setupHandlers(bot)

// Error handler
bot.catch(error => {
	logger.error({ error }, 'Bot error')
})

// Start bot
export async function startBot(): Promise<void> {
	try {
		if (env.NODE_ENV === 'development') {
			await bot.start({
				onStart: info => {
					logger.info(`✅ Bot started in polling mode: @${info.username}`)
				}
			})
		} else {
			const webhookUrl = `https://your-domain.com/webhook`
			await bot.api.setWebhook(webhookUrl)
			logger.info(`✅ Bot started in webhook mode: ${webhookUrl}`)
		}
	} catch (error) {
		logger.error({ error }, 'Failed to start bot')
		process.exit(1)
	}
}
