import type { BotContext } from '../bot/bot'
import { prisma } from '../db/prisma'

export class UserService {
	async upsertFromCtx(ctx: BotContext) {
		const tg = ctx.from
		if (!tg) return null
		return prisma.user.upsert({
			where: { telegramId: BigInt(tg.id) },
			create: {
				telegramId: BigInt(tg.id),
				firstName: tg.first_name,
				lastName: tg.last_name,
				username: tg.username,
				lastSeenAt: new Date()
			},
			update: {
				firstName: tg.first_name,
				lastName: tg.last_name,
				username: tg.username,
				lastSeenAt: new Date()
			}
		})
	}
}

export const userService = new UserService()
