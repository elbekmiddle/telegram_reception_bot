import { Application, AnswerFieldType, FileType, ApplicationStatus } from '@prisma/client'
import { applicationRepo } from '../db/repositories/application.repo'
import { answerRepo } from '../db/repositories/answer.repo'
import { fileRepo } from '../db/repositories/file.repo'
import { logger } from '../utils/logger'
import { StepKey } from '../config/constants'

export class ApplicationService {
	async createApplication(telegramId: number, vacancyId?: string | null): Promise<Application> {
		try {
			// number ni bigint ga aylantirish
			const existing = await applicationRepo.findByTelegramId(BigInt(telegramId))
			// Faqat IN_PROGRESS bo'lsa resume qilamiz.
			// Aks holda (SUBMITTED/APPROVED/REJECTED/CANCELLED) yangi anketa ochamiz.
			if (existing && existing.status === ApplicationStatus.IN_PROGRESS) return existing

			const app = await applicationRepo.create({
				telegramId: BigInt(telegramId),
				status: ApplicationStatus.IN_PROGRESS,
				currentStep: StepKey.PERSON_FULL_NAME,
				vacancyId: vacancyId ?? null
			})

			logger.info({ telegramId, appId: app.id }, 'New application created')
			return app
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to create application')
			throw error
		}
	}

	async updateCurrentStep(applicationId: string, step: string): Promise<void> {
		try {
			await applicationRepo.updateStep(applicationId, step)
		} catch (error) {
			logger.error({ error, applicationId, step }, 'Failed to update current step')
			throw error
		}
	}

	async setVacancy(applicationId: string, vacancyId: string | null): Promise<void> {
		await applicationRepo.updateVacancy(applicationId, vacancyId)
	}

	async saveAnswer(
		applicationId: string,
		fieldKey: string,
		fieldValue: string,
		fieldType: AnswerFieldType
	): Promise<void> {
		try {
			await answerRepo.save({
				applicationId,
				fieldKey,
				fieldValue,
				fieldType
			})

			logger.debug({ applicationId, fieldKey }, 'Answer saved')
		} catch (error: any) {
			// If DB enum is out-of-sync with Prisma enum (common when migrations weren't applied),
			// the flow may crash on values like AnswerFieldType.DATE.
			// Fallback to TEXT so the conversation continues, and log a warning.
			const msg = String(error?.message ?? '')
			if (msg.includes('invalid input value for enum') && msg.includes('AnswerFieldType')) {
				logger.warn({ error, applicationId, fieldKey, fieldType }, 'AnswerFieldType mismatch. Falling back to TEXT.')
				await answerRepo.save({
					applicationId,
					fieldKey,
					fieldValue,
					fieldType: AnswerFieldType.TEXT
				})
				return
			}

			logger.error({ error, applicationId, fieldKey }, 'Failed to save answer')
			throw error
		}
	}

	async saveFile(
		applicationId: string,
		type: FileType,
		telegramFileId: string,
		data?: { cloudinaryUrl?: string; cloudinaryPublicId?: string; meta?: Record<string, unknown> }
	): Promise<void> {
		try {
			await fileRepo.save({
				applicationId,
				type,
				telegramFileId,
				cloudinaryUrl: data?.cloudinaryUrl,
				cloudinaryPublicId: data?.cloudinaryPublicId,
				meta: data?.meta || {}
			})

			logger.info({ applicationId, type }, 'File saved')
		} catch (error) {
			logger.error({ error, applicationId, type }, 'Failed to save file')
			throw error
		}
	}

	async submitApplication(applicationId: string): Promise<void> {
		try {
			await applicationRepo.updateStatus(applicationId, ApplicationStatus.SUBMITTED)
			logger.info({ applicationId }, 'Application submitted')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to submit application')
			throw error
		}
	}

	async cancelApplication(applicationId: string): Promise<void> {
		try {
			await applicationRepo.updateStatus(applicationId, ApplicationStatus.CANCELLED)
			logger.info({ applicationId }, 'Application cancelled')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to cancel application')
			throw error
		}
	}

	async getApplicationSummary(applicationId: string): Promise<Record<string, string>> {
		try {
			const answers = await answerRepo.getByApplicationId(applicationId)

			const summary: Record<string, string> = {}
			answers.forEach(answer => {
				summary[answer.fieldKey] = answer.fieldValue
			})

			return summary
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to get application summary')
			throw error
		}
	}
}

export const applicationService = new ApplicationService()
