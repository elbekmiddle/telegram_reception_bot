import { InlineKeyboard } from 'grammy'
import { NavAction } from '../config/constants'

export class KeyboardBuilder {
	static backButton(): InlineKeyboard {
		return new InlineKeyboard().text('⬅️ Orqaga', `NAV|${NavAction.BACK}`)
	}

	static cancelButton(): InlineKeyboard {
		return new InlineKeyboard().text('❌ Bekor qilish', `NAV|${NavAction.CANCEL}`)
	}

	static backAndCancel(): InlineKeyboard {
		return new InlineKeyboard()
			.text('⬅️ Orqaga', `NAV|${NavAction.BACK}`)
			.text('❌ Bekor qilish', `NAV|${NavAction.CANCEL}`)
	}

	static skipButton(): InlineKeyboard {
		return new InlineKeyboard().text('⏭️ O‘tkazib yuborish', `NAV|${NavAction.SKIP}`)
	}

	static doneButton(): InlineKeyboard {
		return new InlineKeyboard().text('✅ Tayyor', `NAV|${NavAction.DONE}`)
	}

	static singleSelect(
		options: Record<string, string>,
		prefix: string,
		back = true
	): InlineKeyboard {
		const keyboard = new InlineKeyboard()
		const entries = Object.entries(options)

		for (let i = 0; i < entries.length; i += 2) {
			const row = []
			row.push(keyboard.text(entries[i][1], `${prefix}|${entries[i][0]}`))
			if (i + 1 < entries.length) {
				row.push(keyboard.text(entries[i + 1][1], `${prefix}|${entries[i + 1][0]}`))
			}
			keyboard.row()
		}

		if (back) {
			keyboard.row().add(this.backButton())
		}

		return keyboard
	}

	static multiSelect(
		options: Record<string, string>,
		prefix: string,
		selected: Record<string, boolean> = {}
	): InlineKeyboard {
		const keyboard = new InlineKeyboard()
		const entries = Object.entries(options)

		for (let i = 0; i < entries.length; i += 2) {
			const row = []

			const [key1, label1] = entries[i]
			const check1 = selected[key1] ? '✅ ' : ''
			row.push(keyboard.text(`${check1}${label1}`, `${prefix}|TOGG|${key1}`))

			if (i + 1 < entries.length) {
				const [key2, label2] = entries[i + 1]
				const check2 = selected[key2] ? '✅ ' : ''
				row.push(keyboard.text(`${check2}${label2}`, `${prefix}|TOGG|${key2}`))
			}

			keyboard.row()
		}

		return keyboard.row().text('✅ Tayyor', `${prefix}|DONE`).row().add(this.backButton())
	}

	static photoRulesKeyboard(): InlineKeyboard {
		return new InlineKeyboard()
			.text('🔄 Qayta yuborish', 'PHOTO|RETRY')
			.row()
			.text('📋 Qoidani ko‘rsat', 'PHOTO|RULES')
			.row()
			.add(this.cancelButton())
	}

	static confirmSubmit(): InlineKeyboard {
		return new InlineKeyboard()
			.text('✅ Tasdiqlash', 'CONFIRM|SUBMIT')
			.text('✏️ Tahrirlash', 'NAV|EDIT')
			.row()
			.add(this.cancelButton())
	}
}
