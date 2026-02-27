export class Validators {
	static validateName(name: string): boolean {
		const trimmed = name.trim()
		if (trimmed.length < 3 || trimmed.length > 100) return false
		// Faqat harflar, bo'shliq va tire
		return /^[A-Za-zÀ-ÖØ-öø-ÿ\s\-']+$/.test(trimmed)
	}

	static validateBirthDate(date: string): { isValid: boolean; parsed?: Date } {
		const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/
		const match = date.match(regex)

		if (!match) return { isValid: false }

		const [, day, month, year] = match
		const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

		const isValid =
			parsedDate.getDate() === parseInt(day) &&
			parsedDate.getMonth() === parseInt(month) - 1 &&
			parsedDate.getFullYear() === parseInt(year) &&
			parsedDate < new Date() && // Tug'ilgan sana kelajakda bo'lmasin
			parsedDate > new Date(1900, 0, 1) // 1900 dan oldin bo'lmasin

		return { isValid, parsed: isValid ? parsedDate : undefined }
	}

	static validatePhone(phone: string): boolean {
		// +998 XX XXX-XX-XX format
		const cleaned = phone.replace(/\D/g, '')
		return cleaned.length === 12 && cleaned.startsWith('998')
	}

	static validateCustomDuration(duration: string): boolean {
		// "6 oy", "2 yil", "18 oy" kabi formatlar
		const regex = /^(\d+)\s*(oy|yil)$/i
		return regex.test(duration.trim())
	}

	static validateSalary(salary: string): boolean {
		// Faqat sonlardan iborat bo'lishi kerak
		return /^\d+$/.test(salary.trim())
	}

	static sanitizeText(text: string): string {
		return text.trim().replace(/\s+/g, ' ')
	}
}
