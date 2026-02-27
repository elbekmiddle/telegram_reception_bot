import { Bot } from 'grammy'
import { Context } from '../bot'
import { logger } from '../../utils/logger'

export function setupMessageHandlers(bot: Bot<Context>) {
	// Text handler
	bot.on('message:text', async ctx => {
		logger.debug(
			{
				text: ctx.message.text,
				userId: ctx.from?.id
			},
			'Text message received'
		)
	})

	// Photo handler
	bot.on('message:photo', async ctx => {
		logger.debug(
			{
				userId: ctx.from?.id,
				photoCount: ctx.message.photo.length
			},
			'Photo received'
		)
	})

	// Contact handler
	bot.on('message:contact', async ctx => {
		logger.debug(
			{
				userId: ctx.from?.id,
				phoneNumber: ctx.message.contact.phone_number
			},
			'Contact received'
		)
	})

	// Document handler
	bot.on('message:document', async ctx => {
		logger.debug(
			{
				userId: ctx.from?.id,
				fileName: ctx.message.document.file_name
			},
			'Document received'
		)
	})

	// Voice handler
	bot.on('message:voice', async ctx => {
		logger.debug({ userId: ctx.from?.id }, 'Voice message received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
	})

	// Video handler
	bot.on('message:video', async ctx => {
		logger.debug({ userId: ctx.from?.id }, 'Video received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
	})

	// Sticker handler
	bot.on('message:sticker', async ctx => {
		logger.debug({ userId: ctx.from?.id }, 'Sticker received')
		await ctx.reply('Iltimos, matn yoki rasm yuboring.')
	})

	// Default message handler
	bot.on('message', async ctx => {
		logger.warn(
			{
				message: ctx.message,
				userId: ctx.from?.id
			},
			'Unhandled message type'
		)

		await ctx.reply('Iltimos, tugmalardan foydalaning yoki matn yuboring.')
	})
}
