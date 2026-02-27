import { Application, ApplicationStatus } from '@prisma/client'
import { prisma } from '../prisma'
import { CreateApplicationDTO } from '../../types/domain'
import { logger } from '../../utils/logger'

export class ApplicationRepository {
	async findByTelegramId(telegramId: number): Promise<Application | null> {
		try {
			return await prisma.application.findFirst({
				where: {
					telegramId,
					status: {
						in: ['NEW', 'IN_PROGRESS']
					}
				},
				orderBy: {
					createdAt: 'desc'
				}
			})
		} catch (error) {
			logger.error({ error, telegramId }, 'Error finding application by telegram ID')
			throw error
		}
	}

	async create(data: CreateApplicationDTO): Promise<Application> {
		try {
			return await prisma.application.create({
				data: {
					telegramId: data.telegramId,
					status: data.status,
					currentStep: data.currentStep
				}
			})
		} catch (error) {
			logger.error({ error, data }, 'Error creating application')
			throw error
		}
	}

	async updateStep(id: string, step: string): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					currentStep: step,
					updatedAt: new Date()
				}
			})
		} catch (error) {
			logger.error({ error, id, step }, 'Error updating application step')
			throw error
		}
	}

	async updateStatus(id: string, status: ApplicationStatus): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status,
					...(status === 'SUBMITTED' ? { submittedAt: new Date() } : {}),
					updatedAt: new Date()
				}
			})
		} catch (error) {
			logger.error({ error, id, status }, 'Error updating application status')
			throw error
		}
	}

	async getById(id: string): Promise<Application | null> {
		try {
			return await prisma.application.findUnique({
				where: { id }
			})
		} catch (error) {
			logger.error({ error, id }, 'Error getting application by ID')
			throw error
		}
	}

	async getWithAnswers(id: string): Promise<Application | null> {
		try {
			return await prisma.application.findUnique({
				where: { id },
				include: {
					answers: true,
					files: true
				}
			})
		} catch (error) {
			logger.error({ error, id }, 'Error getting application with answers')
			throw error
		}
	}
}

export const applicationRepo = new ApplicationRepository()
