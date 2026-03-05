import { Bot, Api, RawApi } from 'grammy'
import { InputFile } from 'grammy'
import type { BotContext } from '../bot'

let directBot: Bot<BotContext, Api<RawApi>> | null = null

export function setDirectBot(bot: Bot<BotContext, Api<RawApi>>) {
	directBot = bot
}

export async function directSendPhoto(
	chatId: number | string,
	photo: Buffer | InputFile | string,
	options?: any
): Promise<void> {
	if (!directBot) {
		throw new Error('Direct bot not initialized')
	}

	try {
		// Buffer ni InputFile ga o'giramiz
		let photoToSend: string | InputFile

		if (photo instanceof Buffer) {
			photoToSend = new InputFile(photo)
		} else {
			photoToSend = photo
		}

		await directBot.api.sendPhoto(chatId, photoToSend, options)
	} catch (err) {
		console.error('Failed to send direct photo:', err)
		throw err
	}
}

export async function directSendMessage(
	chatId: number | string,
	text: string,
	options?: any
): Promise<void> {
	if (!directBot) {
		throw new Error('Direct bot not initialized')
	}

	try {
		await directBot.api.sendMessage(chatId, text, options)
	} catch (err) {
		console.error('Failed to send direct message:', err)
		throw err
	}
}
