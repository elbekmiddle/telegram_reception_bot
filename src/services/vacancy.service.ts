import { prisma } from '../db/prisma'
type QuestionType = 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT'

export interface CreateVacancyData {
	title: string
	salary?: string | null
}

export interface CreateQuestionData {
	question: string
	type: QuestionType
	order: number
}

export interface CreateOptionData {
	text: string
	value: string
	order: number
}

export class VacancyService {
	async countActive() {
		return prisma.vacancy.count({ where: { isActive: true } })
	}

	async listActive() {
		return prisma.vacancy.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' }
		})
	}

	async listActivePage(page: number, take = 5) {
		return prisma.vacancy.findMany({
			where: { isActive: true },
			orderBy: { createdAt: 'desc' },
			skip: page * take,
			take
		})
	}

	/**
	 * Get vacancy with questions and options
	 */
	async getWithQuestions(vacancyId: string) {
		return prisma.vacancy.findUnique({
			where: { id: vacancyId },
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
	 * Create new vacancy
	 */
	async create(data: CreateVacancyData) {
		return prisma.vacancy.create({
			data: {
				title: data.title,
				salary: data.salary,
				isActive: true
			}
		})
	}

	/**
	 * Update vacancy
	 */
	async update(vacancyId: string, data: Partial<CreateVacancyData>) {
		return prisma.vacancy.update({
			where: { id: vacancyId },
			data: {
				...(data.title && { title: data.title }),
				...(data.salary !== undefined && { salary: data.salary })
			}
		})
	}

	/**
	 * Delete vacancy
	 */
	async delete(vacancyId: string) {
		return prisma.vacancy.delete({
			where: { id: vacancyId }
		})
	}

	/**
	 * Add question to vacancy
	 */
	async addQuestion(vacancyId: string, data: CreateQuestionData) {
		return prisma.vacancyQuestion.create({
			data: {
				vacancyId,
				question: data.question,
				type: data.type,
				order: data.order
			}
		})
	}

	/**
	 * Update question
	 */
	async updateQuestion(questionId: string, data: Partial<CreateQuestionData>) {
		return prisma.vacancyQuestion.update({
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
		return prisma.vacancyQuestion.delete({
			where: { id: questionId }
		})
	}

	/**
	 * Add option to question
	 */
	async addOption(questionId: string, data: CreateOptionData) {
		return prisma.questionOption.create({
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
	async updateOption(optionId: string, data: Partial<CreateOptionData>) {
		return prisma.questionOption.update({
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
		return prisma.questionOption.delete({
			where: { id: optionId }
		})
	}

	/**
	 * Get all vacancies for admin (including inactive)
	 */
	async listAll() {
		return prisma.vacancy.findMany({
			orderBy: { createdAt: 'desc' },
			include: {
				_count: {
					select: { questions: true }
				}
			}
		})
	}

	/**
	 * Toggle vacancy active status
	 */
	async toggleActive(vacancyId: string) {
		const vacancy = await prisma.vacancy.findUnique({
			where: { id: vacancyId }
		})

		if (!vacancy) throw new Error('Vacancy not found')

		return prisma.vacancy.update({
			where: { id: vacancyId },
			data: { isActive: !vacancy.isActive }
		})
	}
}

export const vacancyService = new VacancyService()
