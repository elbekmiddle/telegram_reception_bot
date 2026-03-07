import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'
import { askText, askChoice, replaceBotMessage } from './flow-helpers'

type AdminNavSignal = 'START' | 'ADMIN'

function isAdminNavSignal(err: unknown): err is Error {
	return err instanceof Error && (err.message === 'START' || err.message === 'ADMIN')
}

type TopCourseStat = {
	title: string
	_count: {
		enrollments: number
	}
}

type TopVacancyStat = {
	title: string
	_count: {
		applications: number
	}
}

function isAdmin(ctx: BotContext): boolean {
	const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
	const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
	const id = ctx.from?.id
	return Boolean(id && (id === admin1 || id === admin2))
}

// ==================== VACANCY MANAGEMENT ====================

async function manageVacancies(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const perPage = 5
	let page = 0

	while (true) {
		const total = await prisma.vacancy.count()

		if (total === 0) {
			await ctx.reply('📭 *Vakansiyalar yo‘q*', { parse_mode: 'Markdown' })
			return
		}

		const totalPages = Math.max(1, Math.ceil(total / perPage))
		page = Math.min(Math.max(0, page), totalPages - 1)

		const items = await prisma.vacancy.findMany({
			orderBy: { createdAt: 'desc' },
			skip: page * perPage,
			take: perPage
		})

		const titleCounts = new Map<string, number>()
		items.forEach(v => {
			titleCounts.set(v.title, (titleCounts.get(v.title) || 0) + 1)
		})

		let text = `📋 *Vakansiyalar ro‘yxati* (sahifa ${page + 1}/${totalPages})\n\n`
		const kb = new InlineKeyboard()

		for (const v of items) {
			const salaryIcon = v.salary ? '💰' : '⚪️'
			const repeatIcon = (titleCounts.get(v.title) || 0) > 1 ? '🔄' : ''

			text += `${v.isActive ? '✅' : '⛔️'} *${v.title}* ${repeatIcon}\n`
			text += `   ${salaryIcon} ${v.salary || 'Maosh kiritilmagan'}\n`
			text += `   🆔 ${v.id.slice(0, 8)}\n`
			text += `   📅 ${new Date(v.createdAt).toLocaleDateString()}\n\n`

			kb.text(`${v.title} (${v.id.slice(0, 4)})`, `VAC|VIEW|${v.id}`).row()
		}

		if (page > 0) kb.text('⬅️ Oldingi', 'VAC|PAGE|PREV')
		if (page < totalPages - 1) kb.text('➡️ Keyingi', 'VAC|PAGE|NEXT')
		kb.row().text('🏠 Bosh menyu', 'NAV|BACK')

		await replaceBotMessage(ctx, text, {
			parse_mode: 'Markdown',
			reply_markup: kb
		})

		const upd = await conversation.wait()
		const data = upd.callbackQuery?.data
		if (!data) continue

		await upd.answerCallbackQuery().catch(() => {})

		if (data === 'NAV|BACK') return
		if (data === 'VAC|PAGE|PREV') {
			page--
			continue
		}
		if (data === 'VAC|PAGE|NEXT') {
			page++
			continue
		}
		if (data.startsWith('VAC|VIEW|')) {
			const id = data.split('|')[2]
			await viewVacancy(conversation, ctx, id)
		}
	}
}

async function viewVacancy(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string
): Promise<void> {
	const vacancy = await prisma.vacancy.findUnique({
		where: { id: vacancyId },
		include: { questions: { include: { options: true } } }
	})

	if (!vacancy) return

	const hasSalary = vacancy.salary !== null && vacancy.salary !== ''

	const text = [
		`📌 *${vacancy.title}*`,
		hasSalary ? `💰 *Maosh:* ${vacancy.salary}` : `💰 *Maosh:* Kiritilmagan`,
		`⚡️ *Holat:* ${vacancy.isActive ? 'Faol' : 'Faol emas'}`,
		`❓ *Savollar:* ${vacancy.questions?.length || 0} ta`,
		'',
		'*Quyidagilardan birini tanlang:*'
	].join('\n')

	const kb = new InlineKeyboard().text('✏️ Nomi', `VAC_EDIT|TITLE|${vacancy.id}`)

	if (hasSalary) {
		kb.text('💰 Maoshni tahrirlash', `VAC_EDIT|SALARY|${vacancy.id}`)
	} else {
		kb.text('💰 Maosh qoʻshish', `VAC_EDIT|ADD_SALARY|${vacancy.id}`)
	}

	kb.row()
		.text('🔀 Faollik', `VAC_EDIT|TOGGLE|${vacancy.id}`)
		.text('❓ Savollar', `VAC_QUESTIONS|${vacancy.id}`)
		.row()
		.text('🗑 O‘chirish', `VAC_DELETE|${vacancy.id}`)
		.row()
		.text('⬅️ Orqaga', 'VAC_BACK')

	await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

	const upd = await conversation.wait()
	const data = upd.callbackQuery?.data
	if (!data) return

	await upd.answerCallbackQuery().catch(() => {})

	if (data === 'VAC_BACK') return

	if (data.startsWith('VAC_EDIT|TITLE|')) {
		const newTitle = await askText(conversation, ctx, `✏️ *Yangi nom* (hozirgi: ${vacancy.title}):`)
		if (newTitle) {
			await prisma.vacancy.update({ where: { id: vacancyId }, data: { title: newTitle } })
			await ctx.reply('✅ Nomi yangilandi!')
		}
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_EDIT|SALARY|')) {
		await editVacancySalary(conversation, ctx, vacancyId, true)
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_EDIT|ADD_SALARY|')) {
		await editVacancySalary(conversation, ctx, vacancyId, false)
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_EDIT|TOGGLE|')) {
		await prisma.vacancy.update({
			where: { id: vacancyId },
			data: { isActive: !vacancy.isActive }
		})
		await ctx.reply(`✅ Vakansiya ${!vacancy.isActive ? 'faollashtirildi' : 'faolsizlashtirildi'}`)
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_QUESTIONS|')) {
		await manageVacancyQuestions(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_DELETE|')) {
		const confirm = await askChoice(conversation, ctx, '⚠️ *Rostdan ham o‘chirilsinmi?*', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yo‘q', data: 'NO' }
		])

		if (confirm === 'YES') {
			await prisma.vacancy.delete({ where: { id: vacancyId } })
			await ctx.reply('✅ Vakansiya o‘chirildi')
		}
		return
	}
}

async function editVacancySalary(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string,
	isEditing: boolean
): Promise<void> {
	const vacancy = await prisma.vacancy.findUnique({ where: { id: vacancyId } })
	if (!vacancy) return

	const currentSalary = isEditing ? `(hozirgi: ${vacancy.salary})` : ''

	const salaryChoice = await askChoice(
		conversation,
		ctx,
		isEditing
			? `💰 *Maoshni tahrirlash* ${currentSalary}\n\nYangi maoshni tanlang:`
			: '💰 *Maosh qoʻshish*\n\nMaoshni tanlang:',
		[
			{ text: '1 000 000 soʻm', data: 'SALARY|1_000_000' },
			{ text: '2 000 000 soʻm', data: 'SALARY|2_000_000' },
			{ text: '4 000 000 soʻm', data: 'SALARY|4_000_000' },
			{ text: 'Kelishiladi', data: 'SALARY|negotiable' },
			{ text: isEditing ? '❌ Oʻchirish' : '⏭ Oʻtkazib yuborish', data: 'SALARY|SKIP' }
		],
		{ columns: 2 }
	)

	if (!salaryChoice || !salaryChoice.startsWith('SALARY|')) return

	const salaryValue = salaryChoice.replace('SALARY|', '')

	if (salaryValue === 'SKIP') {
		if (isEditing) {
			await prisma.vacancy.update({
				where: { id: vacancyId },
				data: { salary: null }
			})
			await ctx.reply('✅ Maosh oʻchirildi!')
		} else {
			await ctx.reply('⏭ Maosh qoʻshilmadi.')
		}
		return
	}

	let newSalary: string
	if (salaryValue === 'negotiable') {
		newSalary = 'Kelishiladi'
	} else {
		newSalary = `${salaryValue.replace(/_/g, ' ')} soʻm`
	}

	await prisma.vacancy.update({
		where: { id: vacancyId },
		data: { salary: newSalary }
	})

	await ctx.reply(
		isEditing ? `✅ Maosh yangilandi: ${newSalary}` : `✅ Maosh qoʻshildi: ${newSalary}`
	)
}

async function manageVacancyQuestions(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string
): Promise<void> {
	while (true) {
		const questions = await prisma.vacancyQuestion.findMany({
			where: { vacancyId },
			include: { options: true },
			orderBy: { order: 'asc' }
		})

		let text = '❓ *Vakansiya savollari*\n\n'
		const kb = new InlineKeyboard()

		if (questions.length === 0) {
			text += 'Hozircha savollar yo‘q.'
		} else {
			questions.forEach((q, idx) => {
				text += `${idx + 1}. *${q.question}*\n`
				text += `   Tur: ${q.type}\n`
				if (q.options.length > 0) {
					text += `   Variantlar: ${q.options.map(o => o.text).join(', ')}\n`
				}
				text += '\n'
				kb.text(`${idx + 1}`, `Q_VIEW|${q.id}`)
			})
			kb.row()
		}

		kb.text('➕ Savol qo‘shish', `Q_ADD|${vacancyId}`)
		kb.row().text('⬅️ Orqaga', 'Q_BACK')

		await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

		const upd = await conversation.wait()
		const data = upd.callbackQuery?.data
		if (!data) continue

		await upd.answerCallbackQuery().catch(() => {})

		if (data === 'Q_BACK') return
		if (data.startsWith('Q_ADD|')) {
			await addVacancyQuestion(conversation, ctx, vacancyId)
			continue
		}
		if (data.startsWith('Q_VIEW|')) {
			const qid = data.split('|')[1]
			await viewVacancyQuestion(conversation, ctx, qid)
		}
	}
}

async function viewVacancyQuestion(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	questionId: string
): Promise<void> {
	const question = await prisma.vacancyQuestion.findUnique({
		where: { id: questionId },
		include: { options: true }
	})

	if (!question) return

	let text = `📝 *${question.question}*\n\n`
	text += `📦 Tur: ${question.type}\n`
	text += `🔢 Tartib: ${question.order}\n\n`

	if (question.options.length > 0) {
		text += '*Variantlar:*\n'
		question.options.forEach((opt, idx) => {
			text += `${idx + 1}. ${opt.text}\n`
		})
	}

	const kb = new InlineKeyboard()
		.text('🗑 O‘chirish', `Q_DELETE|${question.id}`)
		.row()
		.text('⬅️ Orqaga', 'Q_VIEW_BACK')

	await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

	const upd = await conversation.wait()
	const data = upd.callbackQuery?.data
	if (!data) return

	await upd.answerCallbackQuery().catch(() => {})

	if (data === 'Q_VIEW_BACK') return

	if (data.startsWith('Q_DELETE|')) {
		const confirm = await askChoice(conversation, ctx, '⚠️ *Savol o‘chirilsinmi?*', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yo‘q', data: 'NO' }
		])

		if (confirm === 'YES') {
			await prisma.vacancyQuestion.delete({ where: { id: question.id } })
			await ctx.reply('✅ Savol o‘chirildi')
		}
	}
}

async function addVacancyQuestion(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string
): Promise<void> {
	const question = await askText(conversation, ctx, '❓ *Savol matnini kiriting:*')
	if (!question) return

	const type = await askChoice(conversation, ctx, '🧩 *Savol turini tanlang:*', [
		{ text: '✍️ Oddiy matn', data: 'TEXT' },
		{ text: '🔘 Variantli', data: 'SELECT' }
	])
	if (!type) return

	let questionType: 'TEXT' | 'SINGLE_SELECT' = 'TEXT'
	let options: { text: string; value: string }[] = []

	if (type === 'SELECT') {
		questionType = 'SINGLE_SELECT'

		let addMore = true
		let optIndex = 0

		while (addMore) {
			const optText = await askText(
				conversation,
				ctx,
				`📋 *Variant ${optIndex + 1} nomini kiriting:*`
			)
			if (!optText) return

			options.push({
				text: optText,
				value: `opt_${Date.now()}_${optIndex}`
			})
			optIndex++

			if (optIndex >= 1) {
				const more = await askChoice(conversation, ctx, 'Yana variant qo‘shasizmi?', [
					{ text: '➕ Ha', data: 'YES' },
					{ text: '✅ Yetarli', data: 'NO' }
				])
				addMore = more === 'YES'
			}
		}
	}

	const orderStr = await askText(conversation, ctx, '🔢 *Tartib raqami (0 dan):*')
	const order = Number(orderStr?.replace(/\D+/g, '')) || 0

	const created = await prisma.vacancyQuestion.create({
		data: {
			vacancyId,
			question,
			type: questionType,
			order
		}
	})

	if (options.length > 0) {
		for (let i = 0; i < options.length; i++) {
			await prisma.questionOption.create({
				data: {
					questionId: created.id,
					text: options[i].text,
					value: options[i].value,
					order: i
				}
			})
		}
	}

	await ctx.reply(`✅ Savol qoʻshildi! (ID: ${created.id.slice(0, 8)})`)
}

// ==================== COURSE MANAGEMENT ====================

async function manageCourses(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const perPage = 5
	let page = 0

	while (true) {
		const total = await prisma.course.count()

		if (total === 0) {
			await ctx.reply('📭 *Kurslar yoʻq*', { parse_mode: 'Markdown' })
			return
		}

		const totalPages = Math.max(1, Math.ceil(total / perPage))
		page = Math.min(Math.max(0, page), totalPages - 1)

		const courses = await prisma.course.findMany({
			skip: page * perPage,
			take: perPage,
			orderBy: { createdAt: 'desc' }
		})

		let text = `📚 *Kurslar roʻyxati* (sahifa ${page + 1}/${totalPages})\n\n`
		const kb = new InlineKeyboard()

		courses.forEach(course => {
			text += `• ${course.isActive ? '✅' : '⛔️'} *${course.title}*\n`
			text += `  💰 Narxi: ${course.price || 'Kiritilmagan'}\n`
			if (course.description) {
				text += `  📝 ${course.description.substring(0, 50)}${
					course.description.length > 50 ? '...' : ''
				}\n`
			}
			text += '\n'
			kb.text(course.title, `COURSE|VIEW|${course.id}`).row()
		})

		if (page > 0) kb.text('⬅️ Oldingi', 'COURSE|PAGE|PREV')
		if (page < totalPages - 1) kb.text('➡️ Keyingi', 'COURSE|PAGE|NEXT')
		kb.row().text('🏠 Bosh menyu', 'NAV|BACK')

		await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

		const upd = await conversation.wait()
		const data = upd.callbackQuery?.data
		if (!data) continue

		await upd.answerCallbackQuery().catch(() => {})

		if (data === 'NAV|BACK') return
		if (data === 'COURSE|PAGE|PREV') {
			page--
			continue
		}
		if (data === 'COURSE|PAGE|NEXT') {
			page++
			continue
		}
		if (data.startsWith('COURSE|VIEW|')) {
			const courseId = data.split('|')[2]
			await viewCourse(conversation, ctx, courseId)
		}
	}
}

async function viewCourse(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	courseId: string
): Promise<void> {
	const course = await prisma.course.findUnique({
		where: { id: courseId },
		include: { questions: { include: { options: true } } }
	})

	if (!course) return

	const hasPrice = course.price !== null && course.price !== ''

	const text = [
		`🎓 *${course.title}*`,
		'',
		course.description ? `📝 *Tavsif:*\n${course.description}` : '📝 *Tavsif:* Kiritilmagan',
		'',
		hasPrice ? `💰 *Narxi:* ${course.price}` : `💰 *Narxi:* Kiritilmagan`,
		`⚡️ *Holat:* ${course.isActive ? 'Faol' : 'Faol emas'}`,
		`❓ *Savollar:* ${course.questions?.length || 0} ta`,
		'',
		'*Quyidagilardan birini tanlang:*'
	].join('\n')

	const kb = new InlineKeyboard()
		.text('✏️ Nomi', `COURSE_EDIT|TITLE|${course.id}`)
		.text('📝 Tavsif', `COURSE_EDIT|DESC|${course.id}`)
		.row()

	if (hasPrice) {
		kb.text('💰 Narxni tahrirlash', `COURSE_EDIT|PRICE|${course.id}`)
	} else {
		kb.text('💰 Narx qoʻshish', `COURSE_EDIT|ADD_PRICE|${course.id}`)
	}

	kb.text('🔀 Faollik', `COURSE_EDIT|TOGGLE|${course.id}`)
		.row()
		.text('🗑 Oʻchirish', `COURSE_DELETE|${course.id}`)
		.row()
		.text('⬅️ Orqaga', 'COURSE_BACK')

	await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

	const upd = await conversation.wait()
	const data = upd.callbackQuery?.data
	if (!data) return

	await upd.answerCallbackQuery().catch(() => {})

	if (data === 'COURSE_BACK') return

	if (data.startsWith('COURSE_EDIT|TITLE|')) {
		const newTitle = await askText(conversation, ctx, `✏️ *Yangi nom* (hozirgi: ${course.title}):`)
		if (newTitle) {
			await prisma.course.update({ where: { id: courseId }, data: { title: newTitle } })
			await ctx.reply('✅ Nomi yangilandi!')
		}
		await viewCourse(conversation, ctx, courseId)
		return
	}

	if (data.startsWith('COURSE_EDIT|DESC|')) {
		const newDesc = await askText(
			conversation,
			ctx,
			`📝 *Yangi tavsif* (hozirgi: ${
				course.description || 'kiritilmagan'
			}):\n\nTavsif kiritmasangiz, boʻsh qoldirish uchun ➖ belgisini yuboring.`
		)

		if (newDesc) {
			const description = newDesc === '➖' ? null : newDesc
			await prisma.course.update({ where: { id: courseId }, data: { description } })
			await ctx.reply(description ? '✅ Tavsif yangilandi!' : '✅ Tavsif oʻchirildi!')
		}
		await viewCourse(conversation, ctx, courseId)
		return
	}

	if (data.startsWith('COURSE_EDIT|PRICE|') || data.startsWith('COURSE_EDIT|ADD_PRICE|')) {
		await editCoursePrice(conversation, ctx, courseId, course.price !== null)
		await viewCourse(conversation, ctx, courseId)
		return
	}

	if (data.startsWith('COURSE_EDIT|TOGGLE|')) {
		await prisma.course.update({
			where: { id: courseId },
			data: { isActive: !course.isActive }
		})
		await ctx.reply(`✅ Kurs ${!course.isActive ? 'faollashtirildi' : 'faolsizlashtirildi'}`)
		await viewCourse(conversation, ctx, courseId)
		return
	}

	if (data.startsWith('COURSE_QUESTIONS|')) {
		await manageCourseQuestions(conversation, ctx, courseId)
		return
	}

	if (data.startsWith('COURSE_DELETE|')) {
		const confirm = await askChoice(conversation, ctx, '⚠️ *Rostdan ham oʻchirilsinmi?*', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yoʻq', data: 'NO' }
		])

		if (confirm === 'YES') {
			await prisma.course.delete({ where: { id: courseId } })
			await ctx.reply('✅ Kurs oʻchirildi')
		}
		return
	}
}

async function editCoursePrice(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	courseId: string,
	isEditing: boolean
): Promise<void> {
	const course = await prisma.course.findUnique({ where: { id: courseId } })
	if (!course) return

	const currentPrice = isEditing ? `(hozirgi: ${course.price})` : ''

	const priceChoice = await askChoice(
		conversation,
		ctx,
		isEditing
			? `💰 *Narxni tahrirlash* ${currentPrice}\n\nYangi narxni tanlang:`
			: '💰 *Narx qoʻshish*\n\nNarxni tanlang:',
		[
			{ text: '500 000 soʻm', data: 'PRICE|500000' },
			{ text: '1 000 000 soʻm', data: 'PRICE|1000000' },
			{ text: '1 500 000 soʻm', data: 'PRICE|1500000' },
			{ text: '2 000 000 soʻm', data: 'PRICE|2000000' },
			{ text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
			{ text: isEditing ? '❌ Oʻchirish' : '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
		],
		{ columns: 2 }
	)

	if (!priceChoice || !priceChoice.startsWith('PRICE|')) return

	const priceValue = priceChoice.replace('PRICE|', '')

	if (priceValue === 'SKIP') {
		if (isEditing) {
			await prisma.course.update({ where: { id: courseId }, data: { price: null } })
			await ctx.reply('✅ Narx oʻchirildi!')
		} else {
			await ctx.reply('⏭ Narx qoʻshilmadi.')
		}
		return
	}

	let newPrice: string | null = null

	if (priceValue === 'CUSTOM') {
		const customPrice = await askText(conversation, ctx, '💰 *Narxni kiriting:*')
		const cleanPrice = customPrice.replace(/[^0-9]/g, '')
		newPrice = cleanPrice ? `${cleanPrice} soʻm` : null
	} else {
		newPrice = `${parseInt(priceValue, 10).toLocaleString()} soʻm`
	}

	if (newPrice) {
		await prisma.course.update({
			where: { id: courseId },
			data: { price: newPrice }
		})
		await ctx.reply(isEditing ? '✅ Narx yangilandi!' : '✅ Narx qoʻshildi!')
	}
}

async function manageCourseQuestions(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	courseId: string
): Promise<void> {
	while (true) {
		const questions = await prisma.courseQuestion.findMany({
			where: { courseId },
			include: { options: true },
			orderBy: { order: 'asc' }
		})

		let text = '❓ *Kurs savollari*\n\n'
		const kb = new InlineKeyboard()

		if (questions.length === 0) {
			text += 'Hozircha savollar yoʻq.'
		} else {
			questions.forEach((q, idx) => {
				text += `${idx + 1}. *${q.question}*\n`
				text += `   Tur: ${q.type}\n`
				if (q.options.length > 0) {
					text += `   Variantlar: ${q.options.map(o => o.text).join(', ')}\n`
				}
				text += '\n'
				kb.text(`${idx + 1}`, `CQ_VIEW|${q.id}`)
			})
			kb.row()
		}

		kb.text('➕ Savol qoʻshish', `CQ_ADD|${courseId}`)
		kb.row().text('⬅️ Orqaga', 'CQ_BACK')

		await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

		const upd = await conversation.wait()
		const data = upd.callbackQuery?.data
		if (!data) continue

		await upd.answerCallbackQuery().catch(() => {})

		if (data === 'CQ_BACK') return
		if (data.startsWith('CQ_ADD|')) {
			await addCourseQuestion(conversation, ctx, courseId)
			continue
		}
		if (data.startsWith('CQ_VIEW|')) {
			const qid = data.split('|')[1]
			await viewCourseQuestion(conversation, ctx, qid)
		}
	}
}

async function viewCourseQuestion(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	questionId: string
): Promise<void> {
	const question = await prisma.courseQuestion.findUnique({
		where: { id: questionId },
		include: { options: true }
	})

	if (!question) return

	let text = `📝 *${question.question}*\n\n`
	text += `📦 Tur: ${question.type}\n`
	text += `🔢 Tartib: ${question.order}\n\n`

	if (question.options.length > 0) {
		text += '*Variantlar:*\n'
		question.options.forEach((opt, idx) => {
			text += `${idx + 1}. ${opt.text}\n`
		})
	}

	const kb = new InlineKeyboard()
		.text('🗑 Oʻchirish', `CQ_DELETE|${question.id}`)
		.row()
		.text('⬅️ Orqaga', 'CQ_VIEW_BACK')

	await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

	const upd = await conversation.wait()
	const data = upd.callbackQuery?.data
	if (!data) return

	await upd.answerCallbackQuery().catch(() => {})

	if (data === 'CQ_VIEW_BACK') return

	if (data.startsWith('CQ_DELETE|')) {
		const confirm = await askChoice(conversation, ctx, '⚠️ *Savol oʻchirilsinmi?*', [
			{ text: '✅ Ha', data: 'YES' },
			{ text: '❌ Yoʻq', data: 'NO' }
		])

		if (confirm === 'YES') {
			await prisma.courseQuestion.delete({ where: { id: question.id } })
			await ctx.reply('✅ Savol oʻchirildi')
		}
	}
}

async function addCourseQuestion(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	courseId: string
): Promise<void> {
	const question = await askText(conversation, ctx, '❓ *Savol matnini kiriting:*')
	if (!question) return

	const type = await askChoice(conversation, ctx, '🧩 *Savol turi:*', [
		{ text: '✍️ Oddiy matn', data: 'TEXT' },
		{ text: '🔘 Variantli', data: 'SELECT' }
	])
	if (!type) return

	let questionType: 'TEXT' | 'SINGLE_SELECT' = 'TEXT'
	let options: { text: string; value: string }[] = []

	if (type === 'SELECT') {
		questionType = 'SINGLE_SELECT'

		let addMore = true
		let optIndex = 0

		while (addMore) {
			const optText = await askText(conversation, ctx, `📋 *Variant ${optIndex + 1} nomi:*`)
			if (!optText) return

			options.push({
				text: optText,
				value: `opt_${Date.now()}_${optIndex}`
			})
			optIndex++

			if (optIndex >= 1) {
				const more = await askChoice(conversation, ctx, 'Yana variant?', [
					{ text: '➕ Ha', data: 'YES' },
					{ text: '✅ Yetarli', data: 'NO' }
				])
				addMore = more === 'YES'
			}
		}
	}

	const orderStr = await askText(conversation, ctx, '🔢 *Tartib raqami:*')
	const order = Number(orderStr?.replace(/\D+/g, '')) || 0

	const created = await prisma.courseQuestion.create({
		data: {
			courseId,
			question,
			type: questionType,
			order
		}
	})

	if (options.length > 0) {
		for (let i = 0; i < options.length; i++) {
			await prisma.courseQuestionOption.create({
				data: {
					questionId: created.id,
					text: options[i].text,
					value: options[i].value,
					order: i
				}
			})
		}
	}

	await ctx.reply('✅ Savol qoʻshildi!')
}

// ==================== APPLICATIONS MANAGEMENT ====================

async function manageApplications(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const vacancies = await prisma.vacancy.findMany({
		where: { isActive: true },
		orderBy: { createdAt: 'desc' }
	})

	if (!vacancies.length) {
		await ctx.reply('📭 *Faol vakansiyalar topilmadi*', { parse_mode: 'Markdown' })
		return
	}

	const pickedVacancy = await askChoice(
		conversation,
		ctx,
		'📨 *Qaysi vakansiya arizalarini ko‘rasiz?*',
		vacancies.map(v => ({ text: v.title, data: `APP_VAC|${v.id}` }))
	)

	if (!pickedVacancy?.startsWith('APP_VAC|')) return
	const vacancyId = pickedVacancy.split('|')[1]

	const applications = await prisma.application.findMany({
		where: { vacancyId, status: 'SUBMITTED' },
		include: { answers: true, files: true, vacancy: true },
		orderBy: { submittedAt: 'desc' },
		take: 20
	})

	if (!applications.length) {
		await ctx.reply('📭 Bu vakansiya uchun yuborilgan arizalar yo‘q.')
		return
	}

	const pickedApp = await askChoice(
		conversation,
		ctx,
		'📋 *Arizalar ro‘yxati*',
		applications.map(app => {
			const fullName = app.answers.find(a => a.fieldKey === 'full_name')?.fieldValue ?? 'Nomaʼlum'
			return { text: `${fullName} (#${app.id.slice(0, 8)})`, data: `APP_VIEW|${app.id}` }
		})
	)

	if (!pickedApp?.startsWith('APP_VIEW|')) return
	const applicationId = pickedApp.split('|')[1]
	const application = applications.find(a => a.id === applicationId)
	if (!application) return

	const map = new Map(application.answers.map(a => [a.fieldKey, a.fieldValue]))
	const photo = application.files.find(f => f.type === 'HALF_BODY')

	const text = [
		`📌 *Vakansiya:* ${application.vacancy?.title ?? '-'}`,
		'',
		'👤 *Shaxsiy maʼlumotlar*',
		`👤 Ism: ${map.get('full_name') ?? '-'}`,
		`📞 Telefon: ${map.get('phone') ?? '-'}`,
		'',
		'❓ *Savollarga javoblar:*'
	]

	for (const answer of application.answers) {
		if (!['full_name', 'phone'].includes(answer.fieldKey)) {
			text.push(`• ${answer.fieldKey}: ${answer.fieldValue}`)
		}
	}

	const kb = new InlineKeyboard()
		.text('✅ Qabul qilish', `AD|APPROVE|${application.id}`)
		.text('❌ Rad etish', `AD|REJECT|${application.id}`)

	if (photo?.cloudinaryUrl) {
		await ctx.replyWithPhoto(photo.cloudinaryUrl, {
			caption: text.join('\n'),
			parse_mode: 'Markdown',
			reply_markup: kb
		})
	} else {
		await ctx.reply(text.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: kb
		})
	}
}

// ==================== MAIN ADMIN FLOW ====================

export async function adminFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	if (!isAdmin(ctx)) {
		await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
		return
	}

	try {
		while (true) {
			const action = await askChoice(conversation, ctx, '*👨‍💼 Admin panel*', [
				{ text: '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
				{ text: '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
				{ text: '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
				{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' },
				{ text: '📨 Arizalar', data: 'A|APP_LIST' },
				{ text: '📊 Statistika', data: 'A|STATS' },
				{ text: '🧹 Takroriy vakansiyalarni tozalash', data: 'A|CLEAN_DUPLICATES' }
			])

			if (!action) return

			if (action === 'A|STATS') {
				const [
					userCount,
					applicationCount,
					submittedCount,
					approvedCount,
					rejectedCount,
					courseCount,
					courseApproved,
					topCourses,
					topVacancies
				]: [
					number,
					number,
					number,
					number,
					number,
					number,
					number,
					TopCourseStat[],
					TopVacancyStat[]
				] = await Promise.all([
					prisma.user.count(),
					prisma.application.count(),
					prisma.application.count({ where: { status: 'SUBMITTED' } }),
					prisma.application.count({ where: { status: 'APPROVED' } }),
					prisma.application.count({ where: { status: 'REJECTED' } }),
					prisma.courseEnrollment.count(),
					prisma.courseEnrollment.count({ where: { status: 'APPROVED' } }),
					prisma.course.findMany({
						select: {
							title: true,
							_count: {
								select: { enrollments: true }
							}
						},
						orderBy: { enrollments: { _count: 'desc' } },
						take: 5
					}),
					prisma.vacancy.findMany({
						select: {
							title: true,
							_count: {
								select: { applications: true }
							}
						},
						orderBy: { applications: { _count: 'desc' } },
						take: 5
					})
				])

				let statsText = [
					'📊 *Umumiy statistika*',
					'',
					`👥 Foydalanuvchilar: *${userCount}*`,
					`📨 Jami arizalar: *${applicationCount}*`,
					`🆕 Yangi arizalar: *${submittedCount}*`,
					`✅ Qabul qilingan arizalar: *${approvedCount}*`,
					`❌ Rad etilgan arizalar: *${rejectedCount}*`,
					'',
					`🎓 Jami kurs yozilishlar: *${courseCount}*`,
					`✅ Qabul qilingan kurs yozilishlar: *${courseApproved}*`
				].join('\n')

				if (topCourses.length) {
					statsText += '\n\n*Top kurslar:*'
					topCourses.forEach((course: TopCourseStat, idx: number) => {
						statsText += `\n${idx + 1}. ${course.title} — ${course._count.enrollments} ta`
					})
				}

				if (topVacancies.length) {
					statsText += '\n\n*Top vakansiyalar:*'
					topVacancies.forEach((vacancy: TopVacancyStat, idx: number) => {
						statsText += `\n${idx + 1}. ${vacancy.title} — ${vacancy._count.applications} ta`
					})
				}

				const statsAction = await askChoice(conversation, ctx, statsText, [
					{ text: '🔄 Yangilash', data: 'A|STATS' },
					{ text: '⬅️ Orqaga', data: 'A|BACK_ADMIN' }
				])

				if (statsAction === 'A|BACK_ADMIN' || !statsAction) {
					continue
				}

				if (statsAction === 'A|STATS') {
					continue
				}
			}

			if (action === 'A|CLEAN_DUPLICATES') {
				const duplicates = (await prisma.$queryRaw`
					SELECT title, COUNT(*) as count
					FROM vacancies
					GROUP BY title
					HAVING COUNT(*) > 1
				`) as { title: string; count: number }[]

				if (duplicates.length === 0) {
					await ctx.reply('✅ Takroriy vakansiyalar topilmadi!')
					continue
				}

				let text = '🧹 *Takroriy vakansiyalar:*\n\n'
				duplicates.forEach(d => {
					text += `• ${d.title} (${d.count} ta)\n`
				})
				text += '\n*Nima qilmoqchisiz?*'

				const cleanChoice = await askChoice(conversation, ctx, text, [
					{ text: '❌ Hammasini oʻchirish', data: 'DELETE_ALL' },
					{ text: '📋 Koʻrish', data: 'VIEW' },
					{ text: '⬅️ Orqaga', data: 'BACK' }
				])

				if (cleanChoice === 'VIEW') {
					for (const dup of duplicates) {
						const vacancies = await prisma.vacancy.findMany({
							where: { title: dup.title },
							orderBy: { createdAt: 'asc' }
						})

						let msg = `📌 *${dup.title}* (${dup.count} ta)\n\n`
						vacancies.forEach((v, idx) => {
							msg += `${idx + 1}. 🆔 ${v.id.slice(0, 8)} - ${v.salary || 'Maoshsiz'} - ${new Date(
								v.createdAt
							).toLocaleDateString()}\n`
						})

						const dupAction = await askChoice(conversation, ctx, msg, [
							{
								text: '🗑 Eng eskisini qoldirib, boshqasini oʻchirish',
								data: `KEEP_OLD|${dup.title}`
							},
							{
								text: '🗑 Eng yangisini qoldirib, boshqasini oʻchirish',
								data: `KEEP_NEW|${dup.title}`
							},
							{ text: '⬅️ Orqaga', data: 'BACK' }
						])

						if (dupAction?.startsWith('KEEP_OLD|')) {
							const title = dupAction.split('|')[1]
							const sameVacancies = await prisma.vacancy.findMany({
								where: { title },
								orderBy: { createdAt: 'asc' }
							})

							const [, ...toDelete] = sameVacancies
							await prisma.vacancy.deleteMany({
								where: { id: { in: toDelete.map(v => v.id) } }
							})

							await ctx.reply(`✅ ${title} - 1 ta qoldirildi, ${toDelete.length} ta oʻchirildi!`)
						}

						if (dupAction?.startsWith('KEEP_NEW|')) {
							const title = dupAction.split('|')[1]
							const sameVacancies = await prisma.vacancy.findMany({
								where: { title },
								orderBy: { createdAt: 'desc' }
							})

							const [, ...toDelete] = sameVacancies
							await prisma.vacancy.deleteMany({
								where: { id: { in: toDelete.map(v => v.id) } }
							})

							await ctx.reply(`✅ ${title} - 1 ta qoldirildi, ${toDelete.length} ta oʻchirildi!`)
						}
					}
				} else if (cleanChoice === 'DELETE_ALL') {
					const confirm = await askChoice(
						conversation,
						ctx,
						'⚠️ *Barcha takroriy vakansiyalar oʻchirilsinmi?*',
						[
							{ text: '✅ Ha', data: 'YES' },
							{ text: '❌ Yoʻq', data: 'NO' }
						]
					)

					if (confirm === 'YES') {
						for (const dup of duplicates) {
							const vacancies = await prisma.vacancy.findMany({
								where: { title: dup.title },
								orderBy: { createdAt: 'asc' }
							})
							const [, ...toDelete] = vacancies
							await prisma.vacancy.deleteMany({
								where: { id: { in: toDelete.map(v => v.id) } }
							})
						}
						await ctx.reply('✅ Takroriy vakansiyalar tozalandi!')
					}
				}

				continue
			}

			if (action === 'A|VAC_LIST') {
				await manageVacancies(conversation, ctx)
				continue
			}

			if (action === 'A|COURSE_LIST') {
				await manageCourses(conversation, ctx)
				continue
			}

			if (action === 'A|APP_LIST') {
				await manageApplications(conversation, ctx)
				continue
			}

			if (action === 'A|VAC_ADD') {
				const title = await askText(conversation, ctx, '📌 *Step 1: Vakansiya nomini kiriting*')
				if (!title) continue

				const existingVacancy = await prisma.vacancy.findFirst({
					where: {
						title: {
							equals: title,
							mode: 'insensitive'
						}
					}
				})

				if (existingVacancy) {
					const confirm = await askChoice(
						conversation,
						ctx,
						`⚠️ *${title}* nomli vakansiya allaqachon mavjud!\n\nDavom etilsa, takroriy vakansiya yaratiladi.\n\nDavom etasizmi?`,
						[
							{ text: '✅ Ha, davom et', data: 'CONTINUE' },
							{ text: '❌ Yoʻq, bekor qil', data: 'CANCEL' }
						]
					)

					if (confirm !== 'CONTINUE') {
						await ctx.reply('❌ Vakansiya qoʻshish bekor qilindi.')
						continue
					}
				}

				const salaryChoice = await askChoice(
					conversation,
					ctx,
					'💰 *Step 2: Maoshni tanlang yoki oʻtkazib yuboring*',
					[
						{ text: '1 000 000 soʻm', data: 'SALARY|1_000_000' },
						{ text: '2 000 000 soʻm', data: 'SALARY|2_000_000' },
						{ text: '4 000 000 soʻm', data: 'SALARY|4_000_000' },
						{ text: 'Kelishiladi', data: 'SALARY|negotiable' },
						{ text: '⏭ Oʻtkazib yuborish', data: 'SALARY|SKIP' }
					],
					{ columns: 2 }
				)

				let salary: string | null = null

				if (salaryChoice && salaryChoice.startsWith('SALARY|')) {
					const salaryValue = salaryChoice.replace('SALARY|', '')
					if (salaryValue === 'SKIP') {
						salary = null
					} else if (salaryValue === 'negotiable') {
						salary = 'Kelishiladi'
					} else {
						salary = `${salaryValue.replace(/_/g, ' ')} soʻm`
					}
				}

				const vacancy = await prisma.vacancy.create({
					data: {
						title,
						salary,
						isActive: true
					}
				})

				await ctx.reply(
					salary
						? `✅ Vakansiya yaratildi! (ID: ${vacancy.id.slice(0, 8)} - Maosh: ${salary})`
						: `✅ Vakansiya yaratildi! (ID: ${vacancy.id.slice(0, 8)} - Maosh kiritilmadi)`
				)

				await ctx.reply('Endi savollar qoʻshamiz.')

				let addMore = true
				while (addMore) {
					await addVacancyQuestion(conversation, ctx, vacancy.id)

					const more = await askChoice(conversation, ctx, 'Yana savol qoʻshasizmi?', [
						{ text: '➕ Yana savol', data: 'YES' },
						{ text: '✅ Yetarli', data: 'NO' }
					])
					addMore = more === 'YES'
				}

				await ctx.reply('✅ Vakansiya va savollar muvaffaqiyatli qoʻshildi!')
				continue
			}

			if (action === 'A|COURSE_ADD') {
				const title = await askText(conversation, ctx, '🎓 *Step 1: Kurs nomini kiriting:*')
				if (!title) continue

				const description = await askText(
					conversation,
					ctx,
					'📝 *Step 2: Kurs tavsifini kiriting:*\n\nAgar tavsif kiritmasangiz, ➖ belgisini yuboring.'
				)

				const priceChoice = await askChoice(
					conversation,
					ctx,
					'💰 *Step 3: Kurs narxini tanlang yoki oʻtkazib yuboring*',
					[
						{ text: '500 000 soʻm', data: 'PRICE|500000' },
						{ text: '1 000 000 soʻm', data: 'PRICE|1000000' },
						{ text: '1 500 000 soʻm', data: 'PRICE|1500000' },
						{ text: '2 000 000 soʻm', data: 'PRICE|2000000' },
						{ text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
						{ text: '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
					],
					{ columns: 2 }
				)

				let price: string | null = null

				if (priceChoice && priceChoice.startsWith('PRICE|')) {
					const priceValue = priceChoice.replace('PRICE|', '')

					if (priceValue === 'SKIP') {
						price = null
					} else if (priceValue === 'CUSTOM') {
						const customPrice = await askText(
							conversation,
							ctx,
							'💰 *Narxni kiriting:*\n\nMasalan: 750000 yoki 1.2 mln'
						)
						const cleanPrice = customPrice.replace(/[^0-9]/g, '')
						price = cleanPrice ? `${cleanPrice} soʻm` : null
					} else {
						price = `${parseInt(priceValue, 10).toLocaleString()} soʻm`
					}
				}

				await prisma.course.create({
					data: {
						title,
						description: description === '➖' ? null : description,
						price,
						isActive: true
					}
				})

				await ctx.reply(
					price
						? `✅ Kurs muvaffaqiyatli qoʻshildi! (Narx: ${price})`
						: '✅ Kurs muvaffaqiyatli qoʻshildi! (Narx kiritilmadi)'
				)
				continue
			}
		}
	} catch (err) {
		if (isAdminNavSignal(err)) {
			if (err.message === 'START') {
				await ctx.conversation?.exit()
				await ctx.conversation?.enter('startFlow')
				return
			}
			if (err.message === 'ADMIN') {
				await replaceBotMessage(ctx, '👨‍💼 Siz allaqachon admin panelsiz.')
				return
			}
		}

		logger.error({ err }, 'Admin flow failed')
		await replaceBotMessage(ctx, '❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
	}
}
