import { InlineKeyboard } from 'grammy'

export const keyboards = {
	resumeOrRestart(): InlineKeyboard {
		return new InlineKeyboard()
			.text('✅ Davom ettirish', 'NAV|RESUME')
			.text('🔄 Yangidan boshlash', 'NAV|RESTART')
	},

	nav(options: { back?: boolean; cancel?: boolean; skip?: boolean } = {}): InlineKeyboard {
		const kb = new InlineKeyboard()
		if (options.back) kb.text('⬅️ Orqaga', 'NAV|BACK')
		if (options.cancel) kb.text('❌ Bekor qilish', 'NAV|CANCEL')
		if (options.skip) kb.text("⏭️ O'tkazib yuborish", 'NAV|SKIP')
		return kb
	},

	photoRetryOrRules(): InlineKeyboard {
		return new InlineKeyboard()
			.text('🔄 Qayta yuboraman', 'PHOTO|RETRY')
			.text("📋 Qoidani ko'rsat", 'PHOTO|RULES')
			.row()
			.text('❌ Bekor qilish', 'NAV|CANCEL')
	},

	confirmSubmit(): InlineKeyboard {
		return new InlineKeyboard()
			.text('✅ Tasdiqlash', 'CONFIRM|SUBMIT')
			.text('✏️ Tahrirlash', 'CONFIRM|EDIT')
			.row()
			.text('❌ Bekor qilish', 'NAV|CANCEL')
	}
}
