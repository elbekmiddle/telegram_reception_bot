import { Course, CourseLevel } from '@prisma/client'
import { courseRepo } from '../repositories/course.repository'

export class CourseService {
	listActive(): Promise<Course[]> {
		return courseRepo.listActive()
	}

	create(title: string, level: CourseLevel, description?: string | null): Promise<Course> {
		return courseRepo.create({ title, level, description })
	}
}

export const courseService = new CourseService()
