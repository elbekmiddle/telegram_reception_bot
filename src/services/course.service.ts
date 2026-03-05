import { prisma } from '../db/prisma'
import type { QuestionType } from '@prisma/client'

export interface CreateCourseData {
	title: string
	description?: string | null
	price?: string | null
}

export interface CreateCourseQuestionData {
	question: string
	type: QuestionType
	order: number
}

export interface CreateCourseOptionData {
	text: string
	value: string
	order: number
}

export class CourseService {
	/**
	 * List all active courses (limit to 5)
	 */
	async listActive() {
		return prisma.course.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' },
			take: 5
		})
	}

	/**
	 * Get course with questions and options
	 */
	async getWithQuestions(courseId: string) {
		return prisma.course.findUnique({
			where: { id: courseId },
			include: {
				questions: {
					orderBy: { order: 'asc' },
					include: {
						options: {
							orderBy: { order: 'asc' }
						}
					}
				}
			}
		})
	}

	/**
	 * Create new course
	 */
	async create(data: CreateCourseData) {
		return prisma.course.create({
			data: {
				title: data.title,
				description: data.description,
				price: data.price,
				isActive: true
			}
		})
	}

	/**
	 * Update course
	 */
	async update(courseId: string, data: Partial<CreateCourseData>) {
		return prisma.course.update({
			where: { id: courseId },
			data: {
				...(data.title && { title: data.title }),
				...(data.description !== undefined && { description: data.description }),
				...(data.price !== undefined && { price: data.price })
			}
		})
	}

	/**
	 * Delete course
	 */
	async delete(courseId: string) {
		return prisma.course.delete({
			where: { id: courseId }
		})
	}

	/**
	 * Add question to course
	 */
	async addQuestion(courseId: string, data: CreateCourseQuestionData) {
		return prisma.courseQuestion.create({
			data: {
				courseId,
				question: data.question,
				type: data.type,
				order: data.order
			}
		})
	}

	/**
	 * Update question
	 */
	async updateQuestion(questionId: string, data: Partial<CreateCourseQuestionData>) {
		return prisma.courseQuestion.update({
			where: { id: questionId },
			data: {
				...(data.question && { question: data.question }),
				...(data.type && { type: data.type }),
				...(data.order !== undefined && { order: data.order })
			}
		})
	}

	/**
	 * Delete question (cascade deletes options)
	 */
	async deleteQuestion(questionId: string) {
		return prisma.courseQuestion.delete({
			where: { id: questionId }
		})
	}

	/**
	 * Add option to question
	 */
	async addOption(questionId: string, data: CreateCourseOptionData) {
		return prisma.courseQuestionOption.create({
			data: {
				questionId,
				text: data.text,
				value: data.value,
				order: data.order
			}
		})
	}

	/**
	 * Update option
	 */
	async updateOption(optionId: string, data: Partial<CreateCourseOptionData>) {
		return prisma.courseQuestionOption.update({
			where: { id: optionId },
			data: {
				...(data.text && { text: data.text }),
				...(data.value && { value: data.value }),
				...(data.order !== undefined && { order: data.order })
			}
		})
	}

	/**
	 * Delete option
	 */
	async deleteOption(optionId: string) {
		return prisma.courseQuestionOption.delete({
			where: { id: optionId }
		})
	}

	/**
	 * Get all courses for admin (including inactive)
	 */
	async listAll() {
		return prisma.course.findMany({
			orderBy: { createdAt: 'desc' },
			include: {
				_count: {
					select: { questions: true }
				}
			}
		})
	}

	/**
	 * Toggle course active status
	 */
	async toggleActive(courseId: string) {
		const course = await prisma.course.findUnique({
			where: { id: courseId }
		})

		if (!course) throw new Error('Course not found')

		return prisma.course.update({
			where: { id: courseId },
			data: { isActive: !course.isActive }
		})
	}

	/**
	 * Create course enrollment
	 */
	async enroll(data: {
		courseId: string
		userId: string
		fullName: string
		phone: string
		photoFileId?: string
		answers: Record<string, any>
	}) {
		return prisma.courseEnrollment.create({
			data: {
				courseId: data.courseId,
				userId: data.userId,
				fullName: data.fullName,
				phone: data.phone,
				photoFileId: data.photoFileId,
				answers: data.answers
			}
		})
	}

	/**
	 * Get enrollment by ID
	 */
	async getEnrollment(enrollmentId: string) {
		return prisma.courseEnrollment.findUnique({
			where: { id: enrollmentId },
			include: {
				course: {
					include: {
						questions: {
							orderBy: { order: 'asc' },
							include: {
								options: {
									orderBy: { order: 'asc' }
								}
							}
						}
					}
				},
				user: true
			}
		})
	}

	/**
	 * Update enrollment status
	 */
	async updateEnrollmentStatus(
		enrollmentId: string,
		status: 'NEW' | 'APPROVED' | 'REJECTED'
	) {
		return prisma.courseEnrollment.update({
			where: { id: enrollmentId },
			data: { status }
		})
	}
}

export const courseService = new CourseService()
