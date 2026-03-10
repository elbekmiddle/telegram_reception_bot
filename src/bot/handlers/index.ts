import { type Bot } from 'grammy'
import { type BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { handleStartChoice, showStartMenu } from '../start.menu'
import { tryHandleAdminText } from './admin'
import { hasActiveConversations } from '../helpers/conversation.helper'

export function setupHandlers(bot: Bot<BotContext>): void {
  bot.on('callback_query:data', async (ctx, next) => {
    try {
      const data = ctx.callbackQuery.data
      logger.debug({ data, userId: ctx.from?.id }, 'Callback query received')

      if (await hasActiveConversations(ctx)) {
        return next()
      }

      if (
        data === 'user_courses' ||
        data === 'user_vacancies' ||
        data === 'user_back_main' ||
        data.startsWith('START|')
      ) {
        await handleStartChoice(ctx)
        return
      }

      if (data.startsWith('NAV|')) {
        await ctx.answerCallbackQuery().catch(() => {})
        if (data === 'NAV|HOME' || data === 'NAV|BACK') {
          await showStartMenu(ctx)
          return
        }
      }

      return next()
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Callback query handler error')
      return next()
    }
  })

  bot.on('message:text', async (ctx, next) => {
    try {
      if (await hasActiveConversations(ctx)) {
        return next()
      }

      if (await tryHandleAdminText(ctx)) {
        return
      }

      if (ctx.message.text !== '/start' && ctx.message.text !== '/admin') {
        await ctx.reply('Iltimos, /start buyrug‘i bilan boshlang.')
      }
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Text message handler error')
    }
  })

  for (const updateType of ['message:contact', 'message:photo', 'message:document', 'message:voice', 'message:video', 'message:sticker'] as const) {
    bot.on(updateType, async (ctx, next) => {
      try {
        if (await hasActiveConversations(ctx)) {
          return next()
        }
        await ctx.reply("Iltimos, /start buyrug‘i bilan boshlang.")
      } catch (err) {
        logger.error({ err, userId: ctx.from?.id, updateType }, 'Unhandled message type error')
      }
    })
  }

  bot.on('message', async (ctx, next) => {
    try {
      if (await hasActiveConversations(ctx)) {
        return next()
      }
      logger.warn({ messageType: ctx.message, userId: ctx.from?.id }, 'Unhandled message type')
      await ctx.reply("Iltimos, /start buyrug‘i bilan boshlang.")
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Default message handler error')
    }
  })
}
