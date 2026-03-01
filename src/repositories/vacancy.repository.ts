import { Vacancy } from '@prisma/client'
import { prisma } from '../db/prisma'
import { logger } from '../utils/logger'

export type CreateVacancyDTO = {
	title: string
	description?: string | null
	isActive?: boolean
}

export class VacancyRepository {
	async listActive(): Promise<Vacancy[]> {
		return prisma.vacancy.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(data: CreateVacancyDTO): Promise<Vacancy> {
		try {
			return await prisma.vacancy.create({
				data: {
					title: data.title,
					description: data.description ?? null,
					isActive: data.isActive ?? true
				}
			})
		} catch (error) {
			logger.error({ error, data }, 'Error creating vacancy')
			throw error
		}
	}
}

export const vacancyRepo = new VacancyRepository()
