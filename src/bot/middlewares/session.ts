import { session } from 'grammy'
import { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: {},
	createdAt: Date.now(),
	lastActivity: Date.now()
})

export const sessionMiddleware = session<SessionData>({
	initial: initialSessionData,
	getSessionKey: ctx => {
		return ctx.from?.id.toString()
	}
})
