import { Course, CourseLevel } from '@prisma/client'
import { prisma } from '../db/prisma'
import { logger } from '../utils/logger'

export type CreateCourseDTO = {
	title: string
	level: CourseLevel
	description?: string | null
	isActive?: boolean
}

export class CourseRepository {
	async listActive(): Promise<Course[]> {
		return prisma.course.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' }
		})
	}

	async create(data: CreateCourseDTO): Promise<Course> {
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
