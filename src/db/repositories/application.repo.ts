import { Application, ApplicationStatus, Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../../utils/logger'

export type CreateApplicationDTO = {
	telegramId: bigint
	status: ApplicationStatus
	currentStep: string
}

export class ApplicationRepository {
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

	async findByTelegramId(telegramId: bigint): Promise<Application | null> {
		try {
			return await prisma.application.findFirst({
				where: { telegramId },
				orderBy: { createdAt: 'desc' }
			})
		} catch (error) {
			logger.error({ error, telegramId }, 'Error finding application by telegram ID')
			throw error
		}
	}

	async findById(id: string): Promise<Application | null> {
		try {
			return await prisma.application.findUnique({
				where: { id }
			})
		} catch (error) {
			logger.error({ error, id }, 'Error finding application by ID')
			throw error
		}
	}

	async updateStatus(id: string, status: ApplicationStatus): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status,
					updatedAt: new Date()
				}
			})
		} catch (error) {
			logger.error({ error, id, status }, 'Error updating application status')
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
}

export const applicationRepo = new ApplicationRepository()
