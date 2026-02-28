import { ApplicationStatus, FileType, AnswerFieldType } from '@prisma/client'

export interface CreateApplicationDTO {
	telegramId: number
	status: ApplicationStatus
	currentStep?: string
}

export interface SaveAnswerDTO {
	applicationId: string
	fieldKey: string
	fieldValue: string
	fieldType: AnswerFieldType
}

export interface SaveFileDTO {
	applicationId: string
	type: FileType
	telegramFileId: string
	cloudinaryUrl?: string
	cloudinaryPublicId?: string
	meta?: Record<string, unknown>
}

export interface AdminSummary {
	applicationId: string
	telegramId: number
	fullName: string
	phone: string
	education: string
	experience: string
	skills: string[]
	photoFileId?: string
	submittedAt: Date
}
