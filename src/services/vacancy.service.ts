import { Vacancy } from '@prisma/client'
import { vacancyRepo } from '../repositories/vacancy.repository'

export class VacancyService {
	listActive(): Promise<Vacancy[]> {
		return vacancyRepo.listActive()
	}

	create(title: string, description?: string | null): Promise<Vacancy> {
		return vacancyRepo.create({ title, description })
	}
}

export const vacancyService = new VacancyService()
