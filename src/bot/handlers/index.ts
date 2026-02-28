import { type Bot } from 'grammy'
import { type BotContext } from '../bot'
import { setupMessageHandlers } from './messages'
import { setupCallbackHandlers } from './callbacks'
import { setupAdminHandlers } from './admin'

export function setupHandlers(bot: Bot<BotContext>): void {
	setupMessageHandlers(bot)
	setupCallbackHandlers(bot)
	setupAdminHandlers(bot)
}

// Re-export handlers
export * from './messages'
export * from './callbacks'
export * from './admin'
