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
	
export enum StepKey {
  PERSON_FULL_NAME = 'full_name',
  PERSON_PHONE = 'phone',
  PERSON_BIRTH_DATE = 'birth_date',
  PERSON_ADDRESS = 'address',
  FAMILY_STATUS = 'family_status',
  EDUCATION = 'education',
  WORK_EXPERIENCE = 'work_experience',
  CERTIFICATES = 'certificates',
  COMPUTER_SKILLS = 'computer_skills',
  PHOTO = 'photo'
}

export interface SessionData {
  applicationId?: string
  currentStep?: StepKey
  history: StepKey[]
  temp: {
    answers: Record<string, any>
    vacancyPicked?: boolean
    vacancyId?: string
    fullName?: string
    phone?: string
    photoFileId?: string
    photoUrl?: string
    vacancyAnswers?: Record<string, string>
    waitingFor?: string
    multiSelect?: Record<string, boolean>
    approvedApplicationId?: string
    [key: string]: any
  }
  lastBotMessageId?: number
  createdAt?: number
  lastActivity?: number
}