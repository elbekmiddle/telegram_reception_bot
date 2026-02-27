import { ApplicationAnswer } from '@prisma/client'
import { prisma } from '../prisma'
import { SaveAnswerDTO } from '../../types/domain'
import { logger } from '../../utils/logger'

export class AnswerRepository {
	async save(data: SaveAnswerDTO): Promise<ApplicationAnswer> {
		try {
			return await prisma.applicationAnswer.upsert({
				where: {
					applicationId_fieldKey: {
						applicationId: data.applicationId,
						fieldKey: data.fieldKey
					}
				},
				update: {
					fieldValue: data.fieldValue,
					fieldType: data.fieldType
				},
				create: {
					applicationId: data.applicationId,
					fieldKey: data.fieldKey,
					fieldValue: data.fieldValue,
					fieldType: data.fieldType
				}
			})
		} catch (error) {
			logger.error({ error, data }, 'Error saving answer')
			throw error
		}
	}

	async getByApplicationId(applicationId: string): Promise<ApplicationAnswer[]> {
		try {
			return await prisma.applicationAnswer.findMany({
				where: { applicationId },
				orderBy: { createdAt: 'asc' }
			})
		} catch (error) {
			logger.error({ error, applicationId }, 'Error getting answers by application ID')
			throw error
		}
	}

	async getByFieldKey(applicationId: string, fieldKey: string): Promise<ApplicationAnswer | null> {
		try {
			return await prisma.applicationAnswer.findUnique({
				where: {
					applicationId_fieldKey: {
						applicationId,
						fieldKey
					}
				}
			})
		} catch (error) {
			logger.error({ error, applicationId, fieldKey }, 'Error getting answer by field key')
			throw error
		}
	}
}

export const answerRepo = new AnswerRepository()
