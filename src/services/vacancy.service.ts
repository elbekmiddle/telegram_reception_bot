import { vacancyRepo } from '../repositories/vacancy.repository'

export class VacancyService {
	listActive() {
		return vacancyRepo.listActive()
	}

	create(title: string, description?: string | null) {
		return vacancyRepo.create({ title, description })
	}
}

export const vacancyService = new VacancyService()
