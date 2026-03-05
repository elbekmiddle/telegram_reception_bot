/**
 * Admin Flow - Vacancy Management Example
 * This is a STARTER template showing how to implement vacancy CRUD
 * 
 * TODO: Complete implementation for:
 * - Course management
 * - Application review
 * - Course enrollment review
 */

import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'
import type { BotContext } from '../bot'
import { vacancyService } from '../../services/vacancy.service'
import { courseService } from '../../services/course.service'
import { logger } from '../../utils/logger'
import { askText, askInline, replaceBotMessage } from './flow-helpers'

/**
 * Check if user is admin
 */
function isAdmin(telegramId: number | undefined): boolean {
	if (!telegramId) return false
	const adminIds = process.env.ADMIN_IDS?.split(',').map(id => Number(id.trim())) || []
	return adminIds.includes(telegramId)
}

/**
 * Show main admin menu
 */
async function showAdminMenu(ctx: BotContext) {
	const kb = new InlineKeyboard()
		.text('📋 Vakansiyalar', 'ADMIN|VACANCY_LIST')
		.row()
		.text('📚 Kurslar', 'ADMIN|COURSE_LIST')
		.row()
		.text('📥 Arizalar', 'ADMIN|APP_LIST')
		.row()
		.text('🎓 Kurs yozilishlari', 'ADMIN|ENROLL_LIST')

	await replaceBotMessage(
		ctx,
		'🔐 *Admin Panel*\n\nNima qilmoqchisiz?',
		{ parse_mode: 'Markdown', reply_markup: kb }
	)
}

/**
 * List vacancies with actions
 */
async function listVacancies(ctx: BotContext) {
	const vacancies = await vacancyService.listActive()

	if (vacancies.length === 0) {
		const kb = new InlineKeyboard()
			.text('➕ Vakansiya qo\'shish', 'ADMIN|VACANCY_CREATE')
			.row()
			.text('⬅️ Orqaga', 'ADMIN|MENU')

		await replaceBotMessage(
			ctx,
			'📋 *Vakansiyalar*\n\nHozirda faol vakansiyalar yo\'q.',
			{ parse_mode: 'Markdown', reply_markup: kb }
		)
		return
	}

	let message = '📋 *Vakansiyalar*\n\n'
	const kb = new InlineKeyboard()

	for (const v of vacancies.slice(0, 5)) {
		message += `• ${v.title}`
		if (v.salary) message += ` (${v.salary})`
		message += '\n'

		kb.text(v.title, `ADMIN|VACANCY_VIEW|${v.id}`).row()
	}

	kb.text('➕ Yangi vakansiya', 'ADMIN|VACANCY_CREATE')
		.row()
		.text('⬅️ Orqaga', 'ADMIN|MENU')

	await replaceBotMessage(ctx, message, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
}

/**
 * Create new vacancy
 */
async function createVacancy(conversation: Conversation<BotContext>, ctx: BotContext) {
	// Ask for title
	const title = await askText(
		conversation,
		ctx,
		'📝 *Vakansiya nomini kiriting:*\n\nMasalan: *Resepsionist*, *Call-center operatori*',
		{ cancel: true }
	)

	// Ask for salary  
	const salary = await askText(
		conversation,
		ctx,
		'💰 *Maoshni kiriting:*\n\nMasalan: *3-5 million so\'m*, *Kelishilgan*',
		{ cancel: true }
	)

	// Create vacancy
	const vacancy = await vacancyService.create({
		title: title.trim(),
		salary: salary.trim()
	})

	await replaceBotMessage(
		ctx,
		`✅ Vakansiya yaratildi: *${vacancy.title}*\n\nEndi savol qo'shishingiz mumkin.`
	)

	// Ask if want to add questions
	const kb = new InlineKeyboard()
		.text('➕ Savol qo\'shish', `ADMIN|VACANCY_ADD_Q|${vacancy.id}`)
		.row()
		.text('✅ Tayyor', 'ADMIN|VACANCY_LIST')

	await replaceBotMessage(
		ctx,
		`✅ *${vacancy.title}* yaratildi!\n\nSavol qo'shasizmi?`,
		{ parse_mode: 'Markdown', reply_markup: kb }
	)
}

/**
 * Add question to vacancy
 */
async function addQuestionToVacancy(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string
) {
	const vacancy = await vacancyService.getWithQuestions(vacancyId)
	if (!vacancy) {
		await replaceBotMessage(ctx, '❌ Vakansiya topilmadi')
		return
	}

	// Check question limit
	if (vacancy.questions.length >= 6) {
		await replaceBotMessage(
			ctx,
			'❌ Maksimal 6ta savol qo\'shish mumkin.\n\nAvval mavjud savollardan birini o\'chiring.'
		)
		return
	}

	// Ask question text
	const questionText = await askText(
		conversation,
		ctx,
		'❓ *Savolni kiriting:*\n\nMasalan: *Ish tajribangiz bormi?*',
		{ cancel: true }
	)

	// Ask question type
	const typeButtons = [
		{ text: '📝 Matn', data: 'TYPE|TEXT' },
		{ text: '1️⃣ Bir variant', data: 'TYPE|SINGLE' },
		{ text: '☑️ Ko\'p variant', data: 'TYPE|MULTI' }
	]

	const typeChoice = await askInline(
		conversation,
		ctx,
		'🧩 *Savol turi:*',
		typeButtons,
		{ cancel: true, columns: 3 }
	)

	let questionType: 'TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT' = 'TEXT'
	if (typeChoice === 'TYPE|SINGLE') questionType = 'SINGLE_SELECT'
	if (typeChoice === 'TYPE|MULTI') questionType = 'MULTI_SELECT'

	// Create question
	const question = await vacancyService.addQuestion(vacancyId, {
		question: questionText.trim(),
		type: questionType,
		order: vacancy.questions.length
	})

	// If choice question, ask for options
	if (questionType !== 'TEXT') {
		await replaceBotMessage(
			ctx,
			`✅ Savol qo'shildi!\n\nEndi variantlarni qo'shing (maksimal 6ta):`
		)

		for (let i = 0; i < 6; i++) {
			const kb = new InlineKeyboard().text('✅ Tayyor', 'DONE')

			await replaceBotMessage(
				ctx,
				`*Variant ${i + 1}/6*\n\nVariant matnini yozing yoki "✅ Tayyor" bosing:`,
				{ parse_mode: 'Markdown', reply_markup: kb }
			)

			const response = await conversation.wait()

			if (response.callbackQuery?.data === 'DONE') {
				await response.answerCallbackQuery().catch(() => {})
				break
			}

			const optionText = response.message?.text?.trim()
			if (optionText) {
				await vacancyService.addOption(question.id, {
					text: optionText,
					value: `OPT_${i + 1}`,
					order: i
				})

				await replaceBotMessage(ctx, `✅ Variant ${i + 1} qo'shildi!`)
			}
		}
	}

	await replaceBotMessage(ctx, '✅ Savol to\'liq qo\'shildi!')

	// Show menu
	const kb = new InlineKeyboard()
		.text('➕ Yana savol', `ADMIN|VACANCY_ADD_Q|${vacancyId}`)
		.row()
		.text('✅ Tayyor', 'ADMIN|VACANCY_LIST')

	await replaceBotMessage(
		ctx,
		`📋 *${vacancy.title}*\n\nSavollar: ${vacancy.questions.length + 1}/6`,
		{ parse_mode: 'Markdown', reply_markup: kb }
	)
}

/**
 * View vacancy details
 */
async function viewVacancy(ctx: BotContext, vacancyId: string) {
	const vacancy = await vacancyService.getWithQuestions(vacancyId)
	if (!vacancy) {
		await replaceBotMessage(ctx, '❌ Vakansiya topilmadi')
		return
	}

	let message = `📋 *${vacancy.title}*\n`
	if (vacancy.salary) message += `💰 Maosh: ${vacancy.salary}\n`
	message += '\n'

	if (vacancy.questions.length > 0) {
		message += '*Savollar:*\n'
		for (let i = 0; i < vacancy.questions.length; i++) {
			const q = vacancy.questions[i]
			message += `${i + 1}. ${q.question} (${q.type})\n`

			if (q.options.length > 0) {
				for (const opt of q.options) {
					message += `   • ${opt.text}\n`
				}
			}
		}
	} else {
		message += '_Savollar hali qo\'shilmagan_'
	}

	const kb = new InlineKeyboard()
		.text('➕ Savol qo\'shish', `ADMIN|VACANCY_ADD_Q|${vacancyId}`)
		.row()
		.text('✏️ Tahrirlash', `ADMIN|VACANCY_EDIT|${vacancyId}`)
		.text('🗑️ O\'chirish', `ADMIN|VACANCY_DELETE|${vacancyId}`)
		.row()
		.text('⬅️ Orqaga', 'ADMIN|VACANCY_LIST')

	await replaceBotMessage(ctx, message, {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
}

/**
 * Main admin flow
 */
export async function adminFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const telegramId = ctx.from?.id

	if (!isAdmin(telegramId)) {
		await replaceBotMessage(ctx, '❌ Sizda admin huquqi yo\'q.')
		return
	}

	try {
		// Show main menu
		await showAdminMenu(ctx)

		// Main loop
		while (true) {
			const upd = await conversation.wait()

			if (!upd.callbackQuery) continue

			const data = upd.callbackQuery.data
			if (!data) continue

			await upd.answerCallbackQuery().catch(() => {})

			// Parse callback data
			if (data === 'ADMIN|MENU') {
				await showAdminMenu(ctx)
			} else if (data === 'ADMIN|VACANCY_LIST') {
				await listVacancies(ctx)
			} else if (data === 'ADMIN|VACANCY_CREATE') {
				await createVacancy(conversation, ctx)
			} else if (data.startsWith('ADMIN|VACANCY_VIEW|')) {
				const vacancyId = data.replace('ADMIN|VACANCY_VIEW|', '')
				await viewVacancy(ctx, vacancyId)
			} else if (data.startsWith('ADMIN|VACANCY_ADD_Q|')) {
				const vacancyId = data.replace('ADMIN|VACANCY_ADD_Q|', '')
				await addQuestionToVacancy(conversation, ctx, vacancyId)
			}
			// TODO: Add more handlers for:
			// - ADMIN|VACANCY_EDIT|id
			// - ADMIN|VACANCY_DELETE|id  
			// - ADMIN|COURSE_*
			// - ADMIN|APP_*
			// - ADMIN|ENROLL_*
		}
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'adminFlow failed')
		await replaceBotMessage(ctx, 'Xatolik yuz berdi.')
	}
}
