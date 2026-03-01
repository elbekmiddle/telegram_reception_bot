import { prisma } from '../db/prisma'
import { logger } from '../utils/logger'

export type CreateCourseDTO = {
	title: string
	level: string
	description?: string | null
	isActive?: boolean
}

export class CourseRepository {
	async listActive() {
		return prisma.course.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(data: CreateCourseDTO) {
		try {
			return await prisma.course.create({
				data: {
					title: data.title,
					level: data.level,
					description: data.description ?? null,
					isActive: data.isActive ?? true
				}
			})
		} catch (error) {
			logger.error({ error, data }, 'Error creating course')
			throw error
		}
	}
}

export const courseRepo = new CourseRepository()
