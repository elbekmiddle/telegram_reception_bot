import { session, type Context } from 'grammy'
import type { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: { answers: {} },
	createdAt: Date.now(),
	lastActivity: Date.now()
})

export const sessionMiddleware = session<SessionData, Context>({
	initial: initialSessionData,
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
