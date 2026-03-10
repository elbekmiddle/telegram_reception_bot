import { StepKey } from '../config/constants'

export interface SessionData {
	applicationId?: string
	currentStep?: StepKey
	history: StepKey[]
	temp: {
		// Asosiy javoblar
		answers: Record<string, any>

		// Application flow uchun
		vacancyPicked?: boolean
		vacancyId?: string
		fullName?: string
		phone?: string
		photoFileId?: string
		photoUrl?: string
		vacancyAnswers?: Record<string, string>

		// Admin flow uchun
		waitingFor?: string
		multiSelect?: Record<string, boolean>
		approvedApplicationId?: string
		educationType?: string
		hasExp?: boolean
		workShift?: string
		communicationSkill?: string
		customInput?: string

		// Dynamic propertylar uchun
		[key: string]: any
	}
	flowActive: boolean
	flowState?: {
		step: string
		data?: Record<string, any> | any
	}
	lastBotMessageId?: number
	createdAt?: number
	lastActivity?: number
}
