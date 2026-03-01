import { Application, ApplicationStatus, Prisma } from '@prisma/client'
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

	// ===== Yangi metodlar =====

	/**
	 * Barcha arizalarni olish (filter bilan)
	 */
	async findAll(params?: {
		status?: ApplicationStatus
		telegramId?: bigint
		orderBy?: { [key: string]: 'asc' | 'desc' }
		take?: number
		skip?: number
	}): Promise<Application[]> {
		try {
			const where: Prisma.ApplicationWhereInput = {}

			if (params?.status) {
				where.status = params.status
			}

			if (params?.telegramId) {
				where.telegramId = params.telegramId
			}

			return await prisma.application.findMany({
				where,
				orderBy: params?.orderBy || { createdAt: 'desc' },
				take: params?.take,
				skip: params?.skip,
				include: {
					answers: true,
					files: true,
					vacancy: true
				}
			})
		} catch (error) {
			logger.error({ error, params }, 'Error finding all applications')
			throw error
		}
	}

	/**
	 * Arizalar sonini olish (filter bilan)
	 */
	async count(params?: { status?: ApplicationStatus; telegramId?: bigint }): Promise<number> {
		try {
			const where: Prisma.ApplicationWhereInput = {}

			if (params?.status) {
				where.status = params.status
			}

			if (params?.telegramId) {
				where.telegramId = params.telegramId
			}

			return await prisma.application.count({ where })
		} catch (error) {
			logger.error({ error, params }, 'Error counting applications')
			throw error
		}
	}

	/**
	 * Arizani barcha bog'langan ma'lumotlari bilan olish (answers va files)
	 */
	async getFullApplication(id: string): Promise<
		| (Application & {
				answers: any[]
				files: any[]
				vacancy: any | null
		  })
		| null
	> {
		try {
			return await prisma.application.findUnique({
				where: { id },
				include: {
					answers: true,
					files: true,
					vacancy: true
				}
			})
		} catch (error) {
			logger.error({ error, id }, 'Error getting full application')
			throw error
		}
	}

	/**
	 * Faqat SUBMITTED statusidagi arizalarni olish
	 */
	async findSubmitted(take?: number, skip?: number): Promise<Application[]> {
		try {
			return await prisma.application.findMany({
				where: { status: ApplicationStatus.SUBMITTED },
				orderBy: { submittedAt: 'desc' },
				take,
				skip,
				include: {
					answers: true,
					files: true,
					vacancy: true
				}
			})
		} catch (error) {
			logger.error({ error, take, skip }, 'Error finding submitted applications')
			throw error
		}
	}

	/**
	 * Foydalanuvchining barcha arizalarini olish
	 */
	async findByUser(telegramId: bigint): Promise<Application[]> {
		try {
			return await prisma.application.findMany({
				where: { telegramId },
				orderBy: { createdAt: 'desc' },
				include: {
					answers: true,
					files: true,
					vacancy: true
				}
			})
		} catch (error) {
			logger.error({ error, telegramId }, 'Error finding applications by user')
			throw error
		}
	}

	/**
	 * Arizani o'chirish (soft delete emas, hard delete - ehtiyot bo'ling!)
	 */
	async delete(id: string): Promise<Application> {
		try {
			// Avval bog'langan ma'lumotlarni o'chirish kerak
			await prisma.applicationAnswer.deleteMany({
				where: { applicationId: id }
			})

			await prisma.applicationFile.deleteMany({
				where: { applicationId: id }
			})

			// Keyin arizani o'chirish
			return await prisma.application.delete({
				where: { id }
			})
		} catch (error) {
			logger.error({ error, id }, 'Error deleting application')
			throw error
		}
	}

	/**
	 * Eski arizalarni tozalash (masalan, 30 kundan eski CANCELLED arizalar)
	 */
	async deleteOldCancelled(daysOld: number = 30): Promise<number> {
		try {
			const date = new Date()
			date.setDate(date.getDate() - daysOld)

			const result = await prisma.application.deleteMany({
				where: {
					status: ApplicationStatus.CANCELLED,
					updatedAt: {
						lt: date
					}
				}
			})

			logger.info({ count: result.count, daysOld }, 'Old cancelled applications deleted')
			return result.count
		} catch (error) {
			logger.error({ error, daysOld }, 'Error deleting old cancelled applications')
			throw error
		}
	}

	// ===== Admin actions / helpers =====
	async getById(id: string): Promise<Application | null> {
		return this.findById(id)
	}

	async getWithAnswers(id: string): Promise<(Application & { answers: unknown[] }) | null> {
		try {
			return await prisma.application.findUnique({
				where: { id },
				include: {
					answers: true
				}
			})
		} catch (error) {
			logger.error({ error, id }, 'Error getting application with answers')
			throw error
		}
	}

	async getWithFiles(id: string): Promise<(Application & { files: unknown[] }) | null> {
		try {
			return await prisma.application.findUnique({
				where: { id },
				include: {
					files: true
				}
			})
		} catch (error) {
			logger.error({ error, id }, 'Error getting application with files')
			throw error
		}
	}

	async approve(id: string, reviewedBy?: number): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status: ApplicationStatus.APPROVED,
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
					status: ApplicationStatus.REJECTED,
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

	/**
	 * Arizani SUBMITTED qilish (topshirish)
	 */
	async markAsSubmitted(id: string): Promise<Application> {
		try {
			return await prisma.application.update({
				where: { id },
				data: {
					status: ApplicationStatus.SUBMITTED,
					submittedAt: new Date(),
					updatedAt: new Date()
				}
			})
		} catch (error) {
			logger.error({ error, id }, 'Error marking application as submitted')
			throw error
		}
	}
}

export const applicationRepo = new ApplicationRepository()
