import { type Middleware } from 'grammy'
import type { BotContext } from '../bot'
import { query } from '../../db/pg'
import { logger } from '../../utils/logger'

export const updateDedupeMiddleware: Middleware<BotContext> = async (ctx, next) => {
	const updateId = ctx.update.update_id
	try {
		const inserted = await query<{ inserted: boolean }>(
			`INSERT INTO processed_updates (update_id, processed_at)
       VALUES ($1, now())
       ON CONFLICT (update_id) DO NOTHING
       RETURNING true as inserted`,
			[updateId]
		)

		if (inserted.rowCount === 0) {
			logger.debug({ updateId }, 'Duplicate update skipped')
			return
		}

		await next()
	} catch (error) {
		logger.error({ error, updateId }, 'Update dedupe failed, update dropped for safety')
	}
}
