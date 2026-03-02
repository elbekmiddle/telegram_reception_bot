import { type Bot } from 'grammy'
import { type BotContext } from '../bot'
import { logger } from '../../utils/logger'

export function setupHandlers(bot: Bot<BotContext>): void {
  // Callback query handler
  bot.on('callback_query:data', async (ctx, next) => {
    try {
      const data = ctx.callbackQuery.data
      
      logger.debug({ data, userId: ctx.from?.id }, 'Callback query received')
      
      // Conversation active bo'lsa, callbackni conversationga yuboramiz
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }

      // Conversation yo'q bo'lsa, callbackni shu joyda yakunlaymiz
      // Agar conversation active bo'lmasa, faqat NAV callbackni shu joyda handle qilamiz
      if (data.startsWith('NAV|')) {
        try {
          await ctx.answerCallbackQuery()
        } catch (err) {
          logger.warn({ err, userId: ctx.from?.id }, 'Failed to answer callback query')
        }

        // Navigation callbacklar
        if (data === 'NAV|RESUME') {
          await ctx.conversation.enter('applicationFlow')
        } else if (data === 'NAV|RESTART') {
          if (ctx.session.applicationId) {
            // applicationService.cancelApplication(ctx.session.applicationId)
          }
          ctx.session.applicationId = undefined
          ctx.session.currentStep = undefined
          ctx.session.history = []
          ctx.session.temp = { answers: {} }
          await ctx.conversation.enter('applicationFlow')
        }

        return
      }

      return next()
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Callback query handler error')
      return next()
    }
  })

  // Text message handler
  bot.on('message:text', async (ctx, next) => {
    try {
      // Conversation active bo'lsa, xabarni conversationga yuboramiz
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }

      // Agar conversation active bo'lmasa va /start bo'lmasa
      if (ctx.message.text !== '/start') {
        await ctx.reply('Iltimos, /start buyrug\'i bilan boshlang.')
      }
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Text message handler error')
    }
  })

  // Contact handler
  bot.on('message:contact', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }

      logger.debug(
        { userId: ctx.from?.id, phoneNumber: ctx.message.contact.phone_number },
        'Contact received outside conversation'
      )

      await ctx.reply("Iltimos, /start buyrug'i bilan boshlang.")
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Contact handler error')
    }
  })

  // Photo handler
  bot.on('message:photo', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      await ctx.reply('Iltimos, /start buyrug\'i bilan boshlang.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Photo handler error')
    }
  })

  // Document handler
  bot.on('message:document', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      await ctx.reply('Iltimos, /start buyrug\'i bilan boshlang.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Document handler error')
    }
  })

  // Voice handler
  bot.on('message:voice', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      await ctx.reply('Iltimos, matn yoki rasm yuboring.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Voice handler error')
    }
  })

  // Video handler
  bot.on('message:video', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      await ctx.reply('Iltimos, matn yoki rasm yuboring.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Video handler error')
    }
  })

  // Sticker handler
  bot.on('message:sticker', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      await ctx.reply('Iltimos, matn yoki rasm yuboring.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Sticker handler error')
    }
  })

  // Default message handler
  bot.on('message', async (ctx, next) => {
    try {
      const activeConversations = await ctx.conversation.active()
      if (activeConversations.length > 0) {
        return next()
      }
      
      logger.warn({ messageType: ctx.message, userId: ctx.from?.id }, 'Unhandled message type')
      await ctx.reply('Iltimos, /start buyrug\'i bilan boshlang.')
    } catch (err) {
      logger.error({ err, userId: ctx.from?.id }, 'Default message handler error')
    }
  })
}
