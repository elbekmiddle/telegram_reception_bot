import { Bot, Context as GrammyContext, type MiddlewareFn } from 'grammy'
import { conversations, createConversation, type ConversationFlavor } from '@grammyjs/conversations'
import { type SessionFlavor } from 'grammy'

import { env } from '../config/env'
import { logger } from '../utils/logger'
import { sessionMiddleware } from './middlewares/session'
import { authMiddleware } from './middlewares/auth'
import { rateLimitMiddleware } from './middlewares/rateLimit'
import { setupCommands } from './commands'
import { setupHandlers } from './handlers'
import { applicationFlow } from './conversations/application.flow'
import { adminFlow } from './conversations/admin.flow'
import type { SessionData } from '../types/session'

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

// MUHIM ORDER:
// 1. Session
// 2. Conversations
// 3. Rate limit (callbacklarni o'tkazib yuborish kerak)
// 4. Auth
// 5. Commands va Handlers

bot.use(stateMiddleware)
bot.use(sessionMiddleware)

// Conversations plugin
bot.use(conversations())

// Conversationlarni register qilish
bot.use(createConversation(applicationFlow, 'applicationFlow'))
bot.use(createConversation(adminFlow, 'adminFlow'))

// Rate limit - callbacklarni o'tkazib yuborish uchun
bot.use(rateLimitMiddleware)

// Auth middleware
bot.use(authMiddleware)

// Commands va handlers eng oxirida
setupCommands(bot)
setupHandlers(bot)

bot.catch(err => {
	logger.error({ err }, 'Unhandled bot error')
})

export async function startBot(): Promise<void> {
	await bot.start({
		onStart: info => {
			logger.info(
				env.NODE_ENV === 'development'
					? `✅ Bot started (polling): @${info.username}`
					: `✅ Bot started (polling/prod): @${info.username}`
			)
		}
	})
}
