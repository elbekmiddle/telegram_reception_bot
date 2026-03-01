import { StepKey } from '../config/constants'

export interface SessionData {
	// Current state
	currentStep: StepKey
	history: StepKey[]

	// Application reference
	applicationId?: string

	// Temporary data
	temp: {
		waitingFor?: string
		multiSelect?: Record<string, boolean>
		customInput?: string
		
	}

	// Metadata
	createdAt: number
	lastActivity: number
	lastBotMessageId?: number
}

export interface SessionContext {
	session: SessionData
}
