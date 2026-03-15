import { session, type Context } from 'grammy'
import type { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'
import { query } from '../../db/pg'
import { logger } from '../../utils/logger'

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 45

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: { answers: {} },
	flowActive: false,
	flowState: { step: 'idle', data: {} },
	createdAt: Date.now(),
	lastActivity: Date.now()
})

const storage = {
	read: async (key: string): Promise<SessionData | undefined> => {
		const result = await query<{ payload: string }>(
			`SELECT payload FROM bot_sessions
       WHERE session_key = $1 AND expires_at > now()`,
			[key]
		)
		if (!result.rows[0]?.payload) return undefined
		try {
			return JSON.parse(result.rows[0].payload) as SessionData
		} catch (error) {
			logger.warn({ error, key }, 'Corrupted session JSON, resetting session')
			return undefined
		}
	},
	write: async (key: string, value: SessionData): Promise<void> => {
		value.lastActivity = Date.now()
		await query(
			`INSERT INTO bot_sessions (session_key, payload, expires_at, updated_at)
       VALUES ($1, $2, now() + ($3::text || ' seconds')::interval, now())
       ON CONFLICT (session_key) DO UPDATE
       SET payload = EXCLUDED.payload,
           expires_at = EXCLUDED.expires_at,
           updated_at = now()`,
			[key, JSON.stringify(value), SESSION_TTL_SECONDS]
		)
	},
	delete: async (key: string): Promise<void> => {
		await query('DELETE FROM bot_sessions WHERE session_key = $1', [key])
	}
}

export const sessionMiddleware = session<SessionData, Context>({
	initial: initialSessionData,
	storage,
	getSessionKey: ctx => {
		const userId = ctx.from?.id?.toString()
		const chatId = ctx.chat?.id?.toString()
		if (userId) return `user:${userId}`
		if (chatId) return `chat:${chatId}`
		if ('callback_query' in ctx.update && ctx.update.callback_query?.id) {
			return `cb:${ctx.update.callback_query.id}`
		}
		return `upd:${ctx.update.update_id}`
	}
})
