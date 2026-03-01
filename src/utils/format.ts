import { answerRepo } from '../db/repositories/answer.repo'

export async function buildSummary(applicationId: string): Promise<string> {
	const answers = await answerRepo.getByApplicationId(applicationId)
	const answerMap = new Map(answers.map(a => [a.fieldKey, a.fieldValue]))

	const certs = answerMap.get('certificates')
	const skills = answerMap.get('computer_skills')

	let certsDisplay = ''
	if (certs) {
		const certList = JSON.parse(certs)
		certsDisplay = certList
			.map((c: string) => {
				switch (c) {
					case 'ENGLISH':
						return '🇬🇧 Ingliz'
					case 'RUSSIAN':
						return '🇷🇺 Rus'
					case 'ARABIC':
						return '🇸🇦 Arab'
					default:
						return c
				}
			})
			.join(', ')
	}

	let skillsDisplay = ''
	if (skills) {
		const skillList = JSON.parse(skills)
		skillsDisplay = skillList
			.map((s: string) => {
				switch (s) {
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
						return s
				}
			})
			.join(', ')
	}

	return `
👤 *Ism:* ${answerMap.get('full_name') || '—'}
📅 *Tug\'ilgan sana:* ${answerMap.get('birth_date') || '—'}${answerMap.get('birth_age') ? ` (${answerMap.get('birth_age')} yosh)` : ''}
📍 *Manzil:* ${answerMap.get('address') || '—'}
📞 *Telefon:* ${answerMap.get('phone') || '—'}

🎓 *Ta'lim:* ${answerMap.get('education_type') || '—'}
📚 *Mutaxassislik:* ${answerMap.get('speciality') || '—'}
📜 *Sertifikatlar:* ${certsDisplay || '—'}
🏷️ *Sertifikat darajalari:* ${answerMap.get('certificates_level') || '—'}

🏢 *Ish tajribasi:* ${answerMap.get('exp_has') === 'YES' ? 'Bor' : answerMap.get('exp_has') === 'NO' ? `Yo'q` : '—'}
🏢 *Oldin ishlagan joy:* ${answerMap.get('exp_company') || '—'}
⏳ *Ishlagan muddat:* ${answerMap.get('exp_duration') || '—'}
👔 *Lavozim:* ${answerMap.get('exp_position') || '—'}
❓ *Ketish sababi:* ${answerMap.get('exp_leave_reason') || '—'}
🕒 *Biz bilan qancha ishlaydi:* ${answerMap.get('exp_can_work_how_long') || '—'}

💻 *Kompyuter ko\'nikmalari:* ${skillsDisplay || '—'}

🗣️ *Muloqot:* ${answerMap.get('communication_skill') || '—'}
📞 *Qo\'ng\'iroq:* ${answerMap.get('can_answer_calls') === 'CALLS|YES' ? '✅ Ha' : "❌ Yo'q"}
🤝 *Mijoz tajribasi:* ${answerMap.get('client_experience') === 'CLIENT|YES' ? '✅ Ha' : "❌ Yo'q"}
👔 *Kiyinish:* ${answerMap.get('dress_code') === 'DRESS|YES' ? '✅ Ha' : "❌ Yo'q"}
💪 *Stress:* ${answerMap.get('stress_tolerance') || '—'}

⏰ *Ish stavkasi:* ${answerMap.get('work_shift') === 'SHIFT|FULL' ? "⚡ To'liq" : '🕐 Yarim'}
💰 *Oylik kutma:* ${answerMap.get('expected_salary') || '—'}
🚀 *Boshlash:* ${answerMap.get('start_date') || '—'}
  `.trim()
}

export async function buildAdminSummary(applicationId: string): Promise<string> {
	const answers = await answerRepo.getByApplicationId(applicationId)
	const answerMap = new Map(answers.map(a => [a.fieldKey, a.fieldValue]))

	return `
👤 *Ism:* ${answerMap.get('full_name') || '—'}
📅 *Tug\'ilgan sana:* ${answerMap.get('birth_date') || '—'}${answerMap.get('birth_age') ? ` (${answerMap.get('birth_age')} yosh)` : ''}
📞 *Telefon:* ${answerMap.get('phone') || '—'}
📍 *Manzil:* ${answerMap.get('address') || '—'}

🎓 *Ta'lim:* ${answerMap.get('education_type') || '—'}
📚 *Mutaxassislik:* ${answerMap.get('speciality') || '—'}

🏢 *Ish:* ${answerMap.get('exp_company') || '—'} (${answerMap.get('exp_duration') || '—'})
👔 *Lavozim:* ${answerMap.get('exp_position') || '—'}

💻 *Ko\'nikmalar:* ${answerMap.get('computer_skills') || '—'}

💰 *Oylik kutma:* ${answerMap.get('expected_salary') || '—'}
🚀 *Boshlash:* ${answerMap.get('start_date') || '—'}

🆔 #${applicationId.slice(0, 8)}
  `.trim()
}
