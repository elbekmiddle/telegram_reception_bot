export class Validators {
	static validateName(name: string): boolean {
		const trimmed = name.trim()
		if (trimmed.length < 3 || trimmed.length > 100) return false
		// Harflar (latin/kiril), bo'shliq va tire
		return /^[\p{L}\s\-']+$/u.test(trimmed)
	}

	// static validateBirthDate(date: string): { isValid: boolean; parsed?: Date } {
	// 	const regex = /^(\d{2})\.(\d{2})\.(\d{4})$/
	// 	const match = date.match(regex)

	// 	if (!match) return { isValid: false }

	// 	const [, day, month, year] = match
	// 	const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

	// 	const isValid =
	// 		parsedDate.getDate() === parseInt(day) &&
	// 		parsedDate.getMonth() === parseInt(month) - 1 &&
	// 		parsedDate.getFullYear() === parseInt(year) &&
	// 		parsedDate < new Date() && // Tug'ilgan sana kelajakda bo'lmasin
	// 		parsedDate > new Date(1900, 0, 1) // 1900 dan oldin bo'lmasin

	// 	return { isValid, parsed: isValid ? parsedDate : undefined }
	// }

	static validateBirthDate(input: string): { isValid: boolean; date?: Date } {
		if (!input) return { isValid: false }

		const match = input.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
		if (!match) return { isValid: false }

		const day = Number(match[1])
		const month = Number(match[2])
		const year = Number(match[3])

		// Basic range check
		if (year < 1900 || year > new Date().getFullYear()) {
			return { isValid: false }
		}

		if (month < 1 || month > 12) {
			return { isValid: false }
		}

		const date = new Date(year, month - 1, day)

		// Real date check (masalan 31.02.2000 ni ushlaydi)
		if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
			return { isValid: false }
		}

		const now = new Date()
		if (date > now) {
			return { isValid: false }
		}

		// 16 yoshdan kichik bo‘lmasin (aniq kun/oy hisobida)
		let age = now.getFullYear() - year
		const monthDiff = now.getMonth() - (month - 1)
		if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) {
			age -= 1
		}

		if (age < 16) {
			return { isValid: false }
		}

		return { isValid: true, date }
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
	static normalizeBirthDate(input: string): string {
		return String(input)
			.trim()
			.replace(/\s+/g, '')
			.replace(/[\/\-]/g, '.')
			.replace(/[^0-9.]/g, '')
	}
}
