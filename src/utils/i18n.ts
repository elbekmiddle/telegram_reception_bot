import type { BotContext } from '../bot/bot'

export type AppLang = 'uz' | 'ru'

export function getTelegramDefaultLang(code?: string | null): AppLang {
	return code?.toLowerCase().startsWith('ru') ? 'ru' : 'uz'
}

export function getUserLang(ctx: Pick<BotContext, 'session' | 'from'>): AppLang {
	ctx.session.temp ??= { answers: {} } as any
	const stored = ctx.session.temp.language
	if (stored === 'uz' || stored === 'ru') return stored
	const detected = getTelegramDefaultLang(ctx.from?.language_code)
	ctx.session.temp.language = detected
	return detected
}

export function setUserLang(ctx: Pick<BotContext, 'session'>, lang: AppLang): void {
	ctx.session.temp ??= { answers: {} } as any
	ctx.session.temp.language = lang
}

const DICT = {
	uz: {
		menuText: 'Kerakli bo‘limni tanlang.',
		courses: '📚 Kurslar',
		vacancies: '👔 Vakansiyalar',
		myApplications: '📨 Topshirgan arizalarim',
		about: '🏢 Biz haqimizda',
		contact: '📞 Bog‘lanish',
		blog: '📸 Blog',
		language: '🌐 Tilni almashtirish',
		admin: '⚙️ Admin panel',
		backMain: '🏠 Bosh menyu',
		langTitle: '🌐 Kerakli tilni tanlang.',
		langChangedUz: '✅ Til o‘zbekchaga o‘zgartirildi.',
		langChangedRu: '✅ Til rus tiliga o‘zgartirildi.',
		aboutText:
			'🏢 *Biz haqimizda*\n\nBiz ta’lim markazi va ishga qabul jarayonlarini Telegram bot orqali qulay boshqarish uchun ishlaymiz. Bu bot orqali kurslar bilan tanishish, vakansiyalarga ariza topshirish va ariza holatini kuzatish mumkin.',
		contactTitle: '📞 *Bog‘lanish*',
		contactTelegram: 'Telegram',
		contactPhone: 'Telefon',
		blogTitle: '📸 *Instagram blog*',
		blogMissing: 'Hozircha Instagram havolasi kiritilmagan.',
		blogOpen: 'Instagram sahifani ochish',
		applicationsTitle: '📨 *Topshirgan arizalaringiz*',
		applicationsEmpty: 'Siz hali hech qanday ariza topshirmagansiz.',
		status_new: 'Yangi',
		status_in_progress: 'Ko‘rib chiqilmoqda',
		status_submitted: 'Yuborilgan',
		status_approved: 'Qabul qilingan',
		status_rejected: 'Rad etilgan',
		status_cancelled: 'Bekor qilingan',
		vacancyListTitle: '📌 *Vakansiyalar ro‘yxati*',
		courseListTitle: '📚 *Kurslar ro‘yxati*',
		apply: '📝 Ariza topshirish',
		enroll: '📝 Kursga yozilish',
		confirm: '✅ Tasdiqlash',
		cancel: '❌ Bekor qilish',
		reviewing: '👀 Ko‘rib chiqish',
		approved: '✅ Qabul qilish',
		rejected: '❌ Rad qilish'
	},
	ru: {
		menuText: 'Выберите нужный раздел.',
		courses: '📚 Курсы',
		vacancies: '👔 Вакансии',
		myApplications: '📨 Мои заявки',
		about: '🏢 О нас',
		contact: '📞 Контакты',
		blog: '📸 Блог',
		language: '🌐 Сменить язык',
		admin: '⚙️ Админ панель',
		backMain: '🏠 Главное меню',
		langTitle: '🌐 Выберите язык.',
		langChangedUz: '✅ Язык переключен на узбекский.',
		langChangedRu: '✅ Язык переключен на русский.',
		aboutText:
			'🏢 *О нас*\n\nМы используем Telegram-бота для удобного управления курсами и приёмом заявок на вакансии. Через бота можно смотреть курсы, откликаться на вакансии и отслеживать статус заявки.',
		contactTitle: '📞 *Контакты*',
		contactTelegram: 'Telegram',
		contactPhone: 'Телефон',
		blogTitle: '📸 *Instagram блог*',
		blogMissing: 'Ссылка на Instagram пока не указана.',
		blogOpen: 'Открыть Instagram',
		applicationsTitle: '📨 *Ваши заявки*',
		applicationsEmpty: 'Вы ещё не отправляли заявки.',
		status_new: 'Новая',
		status_in_progress: 'На рассмотрении',
		status_submitted: 'Отправлена',
		status_approved: 'Принята',
		status_rejected: 'Отклонена',
		status_cancelled: 'Отменена',
		vacancyListTitle: '📌 *Список вакансий*',
		courseListTitle: '📚 *Список курсов*',
		apply: '📝 Откликнуться',
		enroll: '📝 Записаться на курс',
		confirm: '✅ Подтвердить',
		cancel: '❌ Отмена',
		reviewing: '👀 На рассмотрение',
		approved: '✅ Принять',
		rejected: '❌ Отклонить'
	}
} as const

export function t(ctx: Pick<BotContext, 'session' | 'from'>, key: keyof (typeof DICT)['uz']): string {
	const lang = getUserLang(ctx)
	return DICT[lang][key]
}

export function applicationStatusLabel(ctx: Pick<BotContext, 'session' | 'from'>, status: string): string {
	const key = `status_${status.toLowerCase()}` as keyof (typeof DICT)['uz']
	return t(ctx, key in DICT.uz ? key : 'status_submitted')
}
