import { session as grammySession } from 'grammy'
import { SessionData } from '../../types/session'
import { StepKey } from '../../config/constants'

const initialSessionData = (): SessionData => ({
	currentStep: StepKey.PERSON_FULL_NAME,
	history: [],
	temp: {},
	createdAt: Date.now(),
	lastActivity: Date.now()
})

export const session = grammySession({
	initial: initialSessionData,
	getSessionKey: ctx => {
		return ctx.from?.id.toString()
	}
})
