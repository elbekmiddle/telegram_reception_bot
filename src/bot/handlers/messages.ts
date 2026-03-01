import { type Bot } from 'grammy'
import { type BotContext } from '../bot'
import { logger } from '../../utils/logger'

export function setupMessageHandlers(bot: Bot<BotContext>): void {
	// Text handler
	bot.on('message:text', async (ctx, next) => {
		// conversation ichida bo'lsa, aralashmaymiz
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug({ text: ctx.message.text, userId: ctx.from?.id }, 'Text message received')
		return next()
	})

	bot.on('message:photo', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug({ userId: ctx.from?.id, photoCount: ctx.message.photo.length }, 'Photo received')
		return next()
	})

	bot.on('message:contact', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug(
			{ userId: ctx.from?.id, phoneNumber: ctx.message.contact.phone_number },
			'Contact received'
		)
		return next()
	})

	bot.on('message:document', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug(
			{ userId: ctx.from?.id, fileName: ctx.message.document.file_name },
			'Document received'
		)
		return next()
	})

	// Bular foydalanuvchiga javob qaytaradi: conversation ichida bo'lsa UMUMAN javob bermasin
	bot.on('message:voice', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug({ userId: ctx.from?.id }, 'Voice message received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
		return next()
	})

	bot.on('message:video', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug({ userId: ctx.from?.id }, 'Video received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
		return next()
	})

	bot.on('message:sticker', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.debug({ userId: ctx.from?.id }, 'Sticker received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
		return next()
	})

	// Default message handler ham conversation’ni buzmasin
	bot.on('message', async (ctx, next) => {
		const actives = await ctx.conversation.active().catch(() => [])
		if (actives.length) return next()

		logger.warn({ message: ctx.message, userId: ctx.from?.id }, 'Unhandled message type')
		await ctx.reply('Iltimos, tugmalardan foydalaning yoki matn yuboring.')
		return next()
	})
}
