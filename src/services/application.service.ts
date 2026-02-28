import { Application, AnswerFieldType, FileType } from '@prisma/client'
import { applicationRepo } from '../db/repositories/application.repo'
import { answerRepo } from '../db/repositories/answer.repo'
import { fileRepo } from '../db/repositories/file.repo'
import { logger } from '../utils/logger'
import { StepKey } from '../config/constants'

export class ApplicationService {
	async createApplication(telegramId: number): Promise<Application> {
		try {
			// number ni bigint ga aylantirish
			const existing = await applicationRepo.findByTelegramId(BigInt(telegramId))

			if (existing) {
				return existing
			}

			const app = await applicationRepo.create({
				telegramId: BigInt(telegramId),
				status: 'IN_PROGRESS',
				currentStep: StepKey.PERSON_FULL_NAME
			})

			logger.info({ telegramId, appId: app.id }, 'New application created')
			return app
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to create application')
			throw error
		}
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
		} catch (error) {
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
			await applicationRepo.updateStatus(applicationId, 'SUBMITTED')
			logger.info({ applicationId }, 'Application submitted')
		} catch (error) {
			logger.error({ error, applicationId }, 'Failed to submit application')
			throw error
		}
	}

	async cancelApplication(applicationId: string): Promise<void> {
		try {
			await applicationRepo.updateStatus(applicationId, 'CANCELLED')
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
