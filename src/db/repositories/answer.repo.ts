import { ApplicationAnswer, AnswerFieldType } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../../utils/logger'

export type SaveAnswerDTO = {
	applicationId: string
	fieldKey: string
	fieldValue: string
	fieldType: AnswerFieldType
}

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

	async getByKey(applicationId: string, fieldKey: string): Promise<ApplicationAnswer | null> {
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
			logger.error({ error, applicationId, fieldKey }, 'Error getting answer by key')
			throw error
		}
	}

	async deleteByApplicationId(applicationId: string): Promise<void> {
		try {
			await prisma.applicationAnswer.deleteMany({
				where: { applicationId }
			})
		} catch (error) {
			logger.error({ error, applicationId }, 'Error deleting answers')
			throw error
		}
	}
}

export const answerRepo = new AnswerRepository()
