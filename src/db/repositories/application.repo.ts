import { Application, ApplicationStatus } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../../utils/logger'

export type CreateApplicationDTO = {
	telegramId: bigint
	status: ApplicationStatus
	currentStep: string
	vacancyId?: string | null
}

export class ApplicationRepository {
	async create(data: CreateApplicationDTO): Promise<Application> {
		try {
			return await prisma.application.create({
				data: {
					telegramId: data.telegramId,
					status: data.status,
					currentStep: data.currentStep,
					vacancyId: data.vacancyId ?? null
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

	async updateVacancy(id: string, vacancyId: string | null): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					vacancyId,
					updatedAt: new Date()
				}
			})
		} catch (error) {
			logger.error({ error, id, vacancyId }, 'Error updating application vacancy')
			throw error
		}
	}

	// ===== Admin actions / helpers =====
	async getById(id: string): Promise<Application | null> {
		return this.findById(id)
	}

	async getWithAnswers(id: string): Promise<(Application & { answers: unknown[] }) | null> {
		try {
			return (await prisma.application.findUnique({
				where: { id },
				include: {
					answers: true
				}
			})) as unknown as (Application & { answers: unknown[] }) | null
		} catch (error) {
			logger.error({ error, id }, 'Error getting application with answers')
			throw error
		}
	}

	async approve(id: string, reviewedBy?: number): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status: 'APPROVED',
					reviewedAt: new Date(),
					reviewedBy: reviewedBy != null ? BigInt(reviewedBy) : null,
					rejectionReason: null
				}
			})
		} catch (error) {
			logger.error({ error, id, reviewedBy }, 'Error approving application')
			throw error
		}
	}

	async reject(id: string, reason: string, reviewedBy?: number): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status: 'REJECTED',
					reviewedAt: new Date(),
					reviewedBy: reviewedBy != null ? BigInt(reviewedBy) : null,
					rejectionReason: reason
				}
			})
		} catch (error) {
			logger.error({ error, id, reviewedBy }, 'Error rejecting application')
			throw error
		}
	}
}

export const applicationRepo = new ApplicationRepository()
