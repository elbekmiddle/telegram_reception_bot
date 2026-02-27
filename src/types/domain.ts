import { ApplicationStatus, FileType, AnswerFieldType } from '@prisma/client'
import { EducationType, Certificate, ComputerSkill } from '../config/constants'

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
	meta?: Record<string, any>
}

export interface PhotoValidationResult {
	ok: boolean
	reason?: string
	width?: number
	height?: number
	buffer?: Buffer
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
