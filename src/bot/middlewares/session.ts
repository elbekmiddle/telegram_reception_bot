import { session, type Context } from 'grammy'
import type { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: {},
	createdAt: Date.now(),
	lastActivity: Date.now()
})

export const sessionMiddleware = session<SessionData, Context>({
	initial: initialSessionData,
	getSessionKey: ctx => {
		// Must always return a string (grammY types expect string, not undefined)
		return ctx.from?.id?.toString() ?? ctx.chat?.id?.toString() ?? 'anonymous'
	}
})
