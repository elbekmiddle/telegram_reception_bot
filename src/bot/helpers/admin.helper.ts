import type { BotContext } from '../bot'
import { env } from '../../config/env'

export function isAdmin(ctx: BotContext): boolean {
	const admin1 = Number(env.ADMIN_CHAT_ID || 0)
	const id = ctx.from?.id
	return Boolean(id && (id === admin1))
}
