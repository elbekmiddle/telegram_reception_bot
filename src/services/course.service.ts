import { courseRepo } from '../repositories/course.repository'

export class CourseService {
	listActive() {
		return courseRepo.listActive()
	}

	create(title: string, level: string, description?: string | null) {
		return courseRepo.create({ title, level, description })
	}
}

export const courseService = new CourseService()
