import { Context } from '../bot'
import { InlineKeyboard } from 'grammy'
import { StepKey } from '../../config/constants'
import { logger } from '../../utils/logger'

export class ConversationHelpers {
	// Savol berish va javob kutish
	static async askText(
		ctx: Context,
		question: string,
		options?: {
			back?: boolean
			cancel?: boolean
			skip?: boolean
		}
	): Promise<string> {
		const keyboard = new InlineKeyboard()

		if (options?.back) keyboard.text('⬅️ Orqaga', 'NAV|BACK')
		if (options?.cancel) keyboard.text('❌ Bekor qilish', 'NAV|CANCEL')
		if (options?.skip) keyboard.text("⏭️ O'tkazib yuborish", 'NAV|SKIP')

		await ctx.reply(question, {
			reply_markup: keyboard.inline_keyboard.length ? keyboard : undefined
		})

		const response = await ctx.conversation.wait()

		if (response.callbackQuery) {
			await response.answerCallbackQuery()
			const data = response.callbackQuery.data

			if (data === 'NAV|BACK') throw new Error('BACK')
			if (data === 'NAV|CANCEL') throw new Error('CANCEL')
			if (data === 'NAV|SKIP') throw new Error('SKIP')
		}

		return response.message?.text || ''
	}

	// Inline tugmalar bilan savol berish
	static async askInline(
		ctx: Context,
		question: string,
		buttons: Array<{ text: string; data: string }>,
		options?: {
			back?: boolean
			cancel?: boolean
			skip?: boolean
			columns?: number
		}
	): Promise<string> {
		const keyboard = new InlineKeyboard()

		// Tugmalarni qatorlarga ajratish
		const columns = options?.columns || 2
		for (let i = 0; i < buttons.length; i += columns) {
			const row = buttons.slice(i, i + columns)
			row.forEach(btn => keyboard.text(btn.text, btn.data))
			keyboard.row()
		}

		if (options?.back) keyboard.text('⬅️ Orqaga', 'NAV|BACK')
		if (options?.cancel) keyboard.text('❌ Bekor qilish', 'NAV|CANCEL')
		if (options?.skip) keyboard.text("⏭️ O'tkazib yuborish", 'NAV|SKIP')

		await ctx.reply(question, { reply_markup: keyboard })

		const response = await ctx.conversation.wait()

		if (!response.callbackQuery) {
			await ctx.reply('Iltimos, tugmalardan birini tanlang.')
			return this.askInline(ctx, question, buttons, options)
		}

		await response.answerCallbackQuery()
		const data = response.callbackQuery.data

		if (data === 'NAV|BACK') throw new Error('BACK')
		if (data === 'NAV|CANCEL') throw new Error('CANCEL')
		if (data === 'NAV|SKIP') throw new Error('SKIP')

		return data
	}

	// Multi-select uchun
	static async askMultiSelect(
		ctx: Context,
		question: string,
		options: Array<{ key: string; label: string }>,
		selected: Set<string> = new Set(),
		optionsConfig?: {
			back?: boolean
			cancel?: boolean
			columns?: number
		}
	): Promise<Set<string>> {
		const keyboard = new InlineKeyboard()
		const columns = optionsConfig?.columns || 2

		for (let i = 0; i < options.length; i += columns) {
			const row = options.slice(i, i + columns)
			row.forEach(opt => {
				const isSelected = selected.has(opt.key)
				const prefix = isSelected ? '✅ ' : ''
				keyboard.text(`${prefix}${opt.label}`, `M|${opt.key}`)
			})
			keyboard.row()
		}

		keyboard.text('✅ Tayyor', 'M|DONE')
		keyboard.row()

		if (optionsConfig?.back) keyboard.text('⬅️ Orqaga', 'NAV|BACK')
		if (optionsConfig?.cancel) keyboard.text('❌ Bekor qilish', 'NAV|CANCEL')

		const selectedDisplay = selected.size
			? `\n\nTanlanganlar: ${Array.from(selected)
					.map(k => options.find(o => o.key === k)?.label || k)
					.join(', ')}`
			: ''

		await ctx.reply(question + selectedDisplay, { reply_markup: keyboard })

		const response = await ctx.conversation.wait()

		if (!response.callbackQuery) {
			return this.askMultiSelect(ctx, question, options, selected, optionsConfig)
		}

		await response.answerCallbackQuery()
		const data = response.callbackQuery.data

		if (data === 'NAV|BACK') throw new Error('BACK')
		if (data === 'NAV|CANCEL') throw new Error('CANCEL')
		if (data === 'M|DONE') return selected

		const key = data.split('|')[1]
		const newSelected = new Set(selected)

		if (newSelected.has(key)) {
			newSelected.delete(key)
		} else {
			newSelected.add(key)
		}

		return this.askMultiSelect(ctx, question, options, newSelected, optionsConfig)
	}

	// Next step helper
	static nextStep(currentStep: StepKey): StepKey {
		const steps = Object.values(StepKey)
		const currentIndex = steps.indexOf(currentStep)
		return steps[currentIndex + 1] || StepKey.SUBMITTED
	}

	// Previous step helper
	static prevStep(currentStep: StepKey): StepKey {
		const steps = Object.values(StepKey)
		const currentIndex = steps.indexOf(currentStep)
		return steps[currentIndex - 1] || steps[0]
	}
}
