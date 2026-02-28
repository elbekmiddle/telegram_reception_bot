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

/**
 * grammY Context'da default `state` yo'q.
 * Shu middleware har update'da `ctx.state`ni init qiladi.
 */
const stateMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
	// grammY'da ctx.state yo'q, runtime'da o'zimiz init qilamiz
	;(ctx as unknown as { state?: Partial<BotState> }).state ??= {}
	await next()
}

export const bot = new Bot<BotContext>(env.BOT_TOKEN)

/**
 * MUHIM ORDER:
 * - session -> conversations -> (rateLimit/auth) -> commands/handlers
 * - Callback query'lar conversation.wait() ga yetib borishi uchun
 *   setupHandlers/Commands ichidagi global callback handlerlar next() qilishi kerak.
 */
bot.use(stateMiddleware)
bot.use(sessionMiddleware)

// Conversations plugin + flow
bot.use(conversations())
bot.use(createConversation(applicationFlow, 'applicationFlow'))

// Rate limit/auth: callbacklarni "yeb qo'ymasligi" kerak.
// Agar rateLimit callbackni bloklasa, rateLimitMiddleware ichida:
//   if (ctx.callbackQuery) return next()
// kabi qoida bo'lishi shart.
bot.use(rateLimitMiddleware)
bot.use(authMiddleware)

// Commands/handlers ENG OXIRIDA
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
