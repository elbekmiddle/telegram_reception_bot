
import { answerRepo } from '../db/repositories/answer.repo'
import { prisma } from '../db/prisma'

function calculateAgeFromBirthDate(date: string): number | null {
	const m = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
	if (!m) return null

	const day = Number(m[1])
	const month = Number(m[2])
	const year = Number(m[3])
	const now = new Date()

	let age = now.getFullYear() - year
	const monthDiff = now.getMonth() - (month - 1)
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < day)) age -= 1

	return age >= 0 ? age : null
}

// Sertifikat nomlarini formatlash
function formatCertificate(key: string): string {
	switch (key) {
		case 'ENGLISH':
			return '🇬🇧 Ingliz tili'
		case 'RUSSIAN':
			return '🇷🇺 Rus tili'
		case 'ARABIC':
			return '🇸🇦 Arab tili'
		case 'GERMAN':
			return '🇩🇪 Nemis tili'
		case 'KOREAN':
			return '🇰🇷 Koreys tili'
		case 'TURKISH':
			return '🇹🇷 Turk tili'
		case 'UZBEK':
			return '🇺🇿 Ona tili'
		case 'MATH':
			return '🧮 Matematika'
		case 'PHYSICS':
			return '⚛️ Fizika'
		case 'CHEMISTRY':
			return '🧪 Kimyo'
		case 'BIOLOGY':
			return '🧬 Biologiya'
		case 'HISTORY':
			return '📜 Tarix'
		case 'LAW':
			return '⚖️ Huquq'
		case 'OTHER':
			return '➕ Boshqa'
		default:
			return key
	}
}

// Kompyuter ko'nikmalarini formatlash
function formatComputerSkill(key: string): string {
	switch (key) {
		case 'WORD':
			return '📝 Word'
		case 'EXCEL':
			return '📊 Excel'
		case 'TELEGRAM':
			return '📱 Telegram'
		case 'CRM':
			return '📋 CRM'
		case 'GOOGLE_SHEETS':
			return '📈 Google Sheets'
		default:
			return key
	}
}

// Ta'lim turini formatlash
function formatEducationType(value: string): string {
	if (value === 'EDU|SCHOOL') return '🏫 Maktab'
	if (value === 'EDU|COLLEGE') return '🏢 Kollej'
	if (value === 'EDU|HIGHER') return "🎓 Oliy ta'lim"
	return value
}

// Muloqot qobiliyatini formatlash
function formatCommunicationSkill(value: string): string {
	if (value === 'COMM|EXCELLENT') return '🌟 Aʼlo'
	if (value === 'COMM|GOOD') return '👍 Yaxshi'
	if (value === 'COMM|AVERAGE') return '👌 Oʻrtacha'
	if (value === 'COMM|SATISFACTORY') return '🤝 Qoniqarli'
	return value
}

// Ish vaqtini formatlash
function formatWorkShift(value: string): string {
	if (value === 'SHIFT|FULL') return "⚡ To'liq stavka"
	if (value === 'SHIFT|HALF') return '🕐 Yarim stavka'
	return value
}

// Ha/Yo'q javoblarini formatlash
function formatYesNo(value: string): string {
	if (
		value === 'YES' ||
		value === 'CALLS|YES' ||
		value === 'CLIENT|YES' ||
		value === 'DRESS|YES' ||
		value === 'EXP|YES'
	)
		return '✅ Ha'
	if (
		value === 'NO' ||
		value === 'CALLS|NO' ||
		value === 'CLIENT|NO' ||
		value === 'DRESS|NO' ||
		value === 'EXP|NO'
	)
		return '❌ Yoʻq'
	return value
}

// Stressga chidamlilikni formatlash
function formatStress(value: string): string {
	if (value === 'STRESS|HIGH') return '🔴 Yuqori'
	if (value === 'STRESS|MID') return '🟡 Oʻrtacha'
	if (value === 'STRESS|LOW') return '🟢 Past'
	return value
}

// Sertifikat darajalarini formatlash
function formatCertificateLevels(levelsMapStr: string | undefined): string {
	if (!levelsMapStr) return '—'
	try {
		const levelsMap = JSON.parse(levelsMapStr)
		const parts: string[] = []
		for (const [key, level] of Object.entries(levelsMap)) {
			const certName = formatCertificate(key)
			parts.push(`${certName}: ${level}`)
		}
		return parts.join(', ')
	} catch {
		return levelsMapStr
	}
}

export async function buildSummary(applicationId: string): Promise<string> {
	const answers = await answerRepo.getByApplicationId(applicationId)
	const answerMap = new Map(answers.map(a => [a.fieldKey, a.fieldValue]))

	// Sertifikatlarni formatlash
	const certs = answerMap.get('certificates')
	let certsDisplay = '—'
	if (certs) {
		try {
			const certList = JSON.parse(certs)
			if (Array.isArray(certList) && certList.length > 0) {
				certsDisplay = certList.map(formatCertificate).join(', ')
			}
		} catch {
			certsDisplay = certs
		}
	}

	// Sertifikat darajalarini formatlash
	const certLevelsDisplay = formatCertificateLevels(answerMap.get('certificates_level'))

	// Kompyuter ko'nikmalarini formatlash
	const skills = answerMap.get('computer_skills')
	let skillsDisplay = '—'
	if (skills) {
		try {
			const skillList = JSON.parse(skills)
			if (Array.isArray(skillList) && skillList.length > 0) {
				skillsDisplay = skillList.map(formatComputerSkill).join(', ')
			}
		} catch {
			skillsDisplay = skills
		}
	}

	// Yoshni hisoblash
	const birthDate = answerMap.get('birth_date')
	let ageDisplay = ''
	if (birthDate) {
		const age = calculateAgeFromBirthDate(birthDate)
		if (age !== null) {
			ageDisplay = ` (${age} yosh)`
		}
	}

	return `
👤 *Shaxsiy ma'lumotlar:*
• Ism, familiya: ${answerMap.get('full_name') || '—'}
• Tug'ilgan sana: ${birthDate || '—'}${ageDisplay}
• Manzil: ${answerMap.get('address') || '—'}
• Telefon: ${answerMap.get('phone') || '—'}
• Oilaviy holat: ${answerMap.get('marital_status')?.replace('MAR|', '') || '—'}

🎓 *Ta'lim:*
• O'quv yurti: ${formatEducationType(answerMap.get('education_type') || '—')}
• Mutaxassislik: ${answerMap.get('speciality') || '—'}
• Sertifikatlar: ${certsDisplay}
• Sertifikat darajalari: ${certLevelsDisplay}

💼 *Ish tajribasi:*
• Tajriba: ${
		answerMap.get('exp_has') === 'YES' ? 'Bor' : answerMap.get('exp_has') === 'NO' ? "Yo'q" : '—'
	}
• Ish joyi: ${answerMap.get('exp_company') || '—'}
• Ish muddati: ${answerMap.get('exp_duration') || '—'}
• Lavozim: ${answerMap.get('exp_position') || '—'}
• Ketish sababi: ${answerMap.get('exp_leave_reason') || '—'}
• Biz bilan ishlash muddati: ${answerMap.get('exp_can_work_how_long') || '—'}

💻 *Ko'nikmalar:*
• Kompyuter: ${skillsDisplay}

🧍‍♀️ *Lavozimga moslik:*
• Muloqot qobiliyati: ${formatCommunicationSkill(answerMap.get('communication_skill') || '—')}
• Telefon qo'ng'iroqlari: ${formatYesNo(answerMap.get('can_answer_calls') || '—')}
• Mijozlar bilan ishlash: ${formatYesNo(answerMap.get('client_experience') || '—')}
• Kiyinish madaniyati: ${formatYesNo(answerMap.get('dress_code') || '—')}
• Stressga chidamlilik: ${formatStress(answerMap.get('stress_tolerance') || '—')}

⏰ *Ish sharoiti:*
• Ish vaqti: ${formatWorkShift(answerMap.get('work_shift') || '—')}
• Oylik kutma: ${answerMap.get('expected_salary') || '—'}
• Ish boshlash: ${answerMap.get('start_date') || '—'}

📎 *Qo'shimcha:*
• 3x4 rasm: ${answerMap.get('photo_half_body') ? '✅ Yuborilgan' : '—'}
• Pasport nusxasi: ${answerMap.get('passport') ? '✅ Yuborilgan' : '—'}
• Tavsiyanoma: ${answerMap.get('recommendation') ? '✅ Yuborilgan' : '—'}

🆔 #${applicationId.slice(0, 8)}
  `.trim()
}

export async function buildAdminSummary(applicationId: string): Promise<string> {
	const answers = await answerRepo.getByApplicationId(applicationId)
	const answerMap = new Map(answers.map(a => [a.fieldKey, a.fieldValue]))
	const app = await prisma.application.findUnique({
		where: { id: applicationId },
		include: { vacancy: true }
	})

	// Yoshni hisoblash
	const birthDate = answerMap.get('birth_date')
	let ageDisplay = ''
	if (birthDate) {
		const age = calculateAgeFromBirthDate(birthDate)
		if (age !== null) {
			ageDisplay = ` (${age} yosh)`
		}
	}

	// Sertifikatlarni qisqacha formatlash
	const certs = answerMap.get('certificates')
	let certsDisplay = '—'
	if (certs) {
		try {
			const certList = JSON.parse(certs)
			if (Array.isArray(certList) && certList.length > 0) {
				certsDisplay = certList.map(formatCertificate).join(', ')
			}
		} catch {
			certsDisplay = certs
		}
	}

	// Kompyuter ko'nikmalarini qisqacha formatlash
	const skills = answerMap.get('computer_skills')
	let skillsDisplay = '—'
	if (skills) {
		try {
			const skillList = JSON.parse(skills)
			if (Array.isArray(skillList) && skillList.length > 0) {
				skillsDisplay = skillList.map(formatComputerSkill).join(', ')
			}
		} catch {
			skillsDisplay = skills
		}
	}

	// Vakansiya savollari
	const vq = Array.from(answerMap.entries()).filter(([k]) => k.startsWith('VQ|'))
	let vqBlock = ''
	if (vq.length) {
		const vacancyId = app?.vacancyId ?? null
		const qMap = new Map<string, string>()
		if (vacancyId) {
			const qs = await prisma.vacancyQuestion.findMany({ where: { vacancyId }, orderBy: { order: 'asc' } })
			for (const q of qs as any[]) qMap.set(String(q.id), q.question)
		}
		vqBlock += `\n❓ *Vakansiya savollari:*\n`
		for (const [k, v] of vq) {
			const key = k.replace('VQ|', '')
			const label = qMap.get(key) ?? key
			let display = v
			try {
				const parsed = JSON.parse(v)
				if (Array.isArray(parsed)) display = parsed.join(', ')
			} catch {
				// ignore
			}
			vqBlock += `• ${label}: ${display}\n`
		}
	}

	const vacTitle = app?.vacancy?.title ?? '—'
	const vacSalary = app?.vacancy?.salaryFrom
		? app?.vacancy?.salaryTo
			? `${app.vacancy.salaryFrom.toLocaleString('ru-RU')} - ${app.vacancy.salaryTo.toLocaleString('ru-RU')} so'm`
			: `${app.vacancy.salaryFrom.toLocaleString('ru-RU')} so'm`
		: 'Kelishilgan'

	return `
	📋 *YANGI ARIZA* #${applicationId.slice(0, 8)}

	📌 *Vakansiya:* ${vacTitle}
	💰 *Oylik:* ${vacSalary}

	👤 *Shaxsiy ma'lumotlar:*
	• Ism: ${answerMap.get('full_name') || '—'}
	• Tug'ilgan sana: ${birthDate || '—'}${ageDisplay}
	• Telefon: ${answerMap.get('phone') || '—'}
	• Manzil: ${answerMap.get('address') || '—'}

	📎 *Rasm:* ${answerMap.get('photo_half_body') ? '✅ Yuborilgan' : '—'}
${vqBlock}

	📅 *Ariza sanasi:* ${new Date().toLocaleDateString('uz-UZ')}
  `.trim()
}

// Admin panel uchun qisqacha ma'lumot
export async function buildAdminShortSummary(applicationId: string): Promise<string> {
	const answers = await answerRepo.getByApplicationId(applicationId)
	const answerMap = new Map(answers.map(a => [a.fieldKey, a.fieldValue]))

	const birthDate = answerMap.get('birth_date')
	let ageDisplay = ''
	if (birthDate) {
		const age = calculateAgeFromBirthDate(birthDate)
		if (age !== null) {
			ageDisplay = `, ${age} yosh`
		}
	}

	return `🆔 #${applicationId.slice(0, 8)} | ${
		answerMap.get('full_name') || 'Ismsiz'
	}${ageDisplay} | 📞 ${answerMap.get('phone') || '—'}`
}
