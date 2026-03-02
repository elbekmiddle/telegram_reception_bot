// types/session.ts
import { StepKey } from '../config/constants'

export interface SessionData {
	applicationId?: string
	currentStep?: StepKey
	history: StepKey[]
	temp: {
		answers: Record<string, any> // Barcha javoblar shu yerda to'planadi
		vacancyPicked?: boolean
		vacancyId?: string
		educationType?: string
		hasExp?: boolean
		workShift?: string
		communicationSkill?: string
		// Qo'shimcha vaqtinchalik ma'lumotlar
		waitingFor?: string
		multiSelect?: Record<string, boolean>
		customInput?: string
		[key: string]: any // Boshqa dynamic propertylar uchun
	}
	lastBotMessageId?: number
	createdAt?: number
	lastActivity?: number
}
	