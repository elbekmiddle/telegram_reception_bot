export const StepKey = {
	// Personal info
	PERSON_FULL_NAME: 'PERSON_FULL_NAME',
	PERSON_BIRTHDATE: 'PERSON_BIRTHDATE',
	PERSON_ADDRESS: 'PERSON_ADDRESS',
	PERSON_PHONE: 'PERSON_PHONE',
	PERSON_MARITAL_STATUS: 'PERSON_MARITAL_STATUS',

	// Education
	EDU_TYPE: 'EDU_TYPE',
	EDU_SPECIALITY: 'EDU_SPECIALITY',
	EDU_CERTS: 'EDU_CERTS',

	// Experience
	EXP_COMPANY: 'EXP_COMPANY',
	EXP_DURATION: 'EXP_DURATION',
	EXP_POSITION: 'EXP_POSITION',
	EXP_LEAVE_REASON: 'EXP_LEAVE_REASON',
	EXP_CAN_WORK_HOW_LONG: 'EXP_CAN_WORK_HOW_LONG',

	// Skills
	SKILLS_COMPUTER: 'SKILLS_COMPUTER',

	// Fit for reception
	FIT_COMMUNICATION: 'FIT_COMMUNICATION',
	FIT_CALLS: 'FIT_CALLS',
	FIT_CLIENT_EXP: 'FIT_CLIENT_EXP',
	FIT_DRESS: 'FIT_DRESS',
	FIT_STRESS: 'FIT_STRESS',

	// Work conditions
	WORK_SHIFT: 'WORK_SHIFT',
	WORK_SALARY: 'WORK_SALARY',
	WORK_START_DATE: 'WORK_START_DATE',

	// Files
	FILE_PHOTO_HALF_BODY: 'FILE_PHOTO_HALF_BODY',
	VACANCY_QUESTIONS: 'VACANCY_QUESTIONS',
	FILE_PASSPORT_OPTIONAL: 'FILE_PASSPORT_OPTIONAL',
	FILE_RECOMMENDATION: 'FILE_RECOMMENDATION',

	// Review
	REVIEW_CONFIRM: 'REVIEW_CONFIRM',
	SUBMITTED: 'SUBMITTED'
} as const

export type StepKey = (typeof StepKey)[keyof typeof StepKey]

export const EducationType = {
	SCHOOL: 'SCHOOL',
	COLLEGE: 'COLLEGE',
	HIGHER: 'HIGHER'
} as const

export type EducationType = (typeof EducationType)[keyof typeof EducationType]

export const Certificates = {
	ENGLISH: 'ENGLISH',
	RUSSIAN: 'RUSSIAN',
	ARABIC: 'ARABIC',
	GERMAN: 'GERMAN',
	KOREAN: 'KOREAN',
	TURKISH: 'TURKISH',
	UZBEK: 'UZBEK',
	MATH: 'MATH',
	PHYSICS: 'PHYSICS',
	CHEMISTRY: 'CHEMISTRY',
	BIOLOGY: 'BIOLOGY',
	HISTORY: 'HISTORY',
	LAW: 'LAW',
	OTHER: 'OTHER'
} as const

export type Certificate = (typeof Certificates)[keyof typeof Certificates]

export const ComputerSkills = {
	WORD: 'WORD',
	EXCEL: 'EXCEL',
	TELEGRAM: 'TELEGRAM',
	CRM: 'CRM',
	GOOGLE_SHEETS: 'GOOGLE_SHEETS'
} as const

export type ComputerSkill = (typeof ComputerSkills)[keyof typeof ComputerSkills]

export const PhotoRules = {
	MIN_WIDTH: 230,
	MIN_HEIGHT: 155,
	MIN_RATIO: 0.3,
	MAX_RATIO: 2.0,
	MAX_WIDTH: 4000,
	MAX_HEIGHT: 4000
} as const

export const RateLimit = {
	MESSAGE_COUNT: 20,
	TIME_WINDOW: 60 * 1000 // 1 minute
} as const

export const CallbackData = {
	// Navigation
	NAV_BACK: 'NAV|BACK',
	NAV_CANCEL: 'NAV|CANCEL',
	NAV_SKIP: 'NAV|SKIP',

	// Photo
	PHOTO_RETRY: 'PHOTO|RETRY',
	PHOTO_RULES: 'PHOTO|RULES',

	// Admin
	ADMIN_APPROVE: 'AD|APPROVE',
	ADMIN_REJECT: 'AD|REJECT',

	// Vacancy Photo
	VAC_PHOTO_RULES: 'VAC_PHOTO|RULES',
	VAC_PHOTO_SKIP: 'VAC_PHOTO|SKIP',

	// Course Photo
	COURSE_PHOTO_RULES: 'COURSE_PHOTO|RULES',
	COURSE_PHOTO_SKIP: 'COURSE_PHOTO|SKIP'
} as const

// ─── New module constants ────────────────────────────────────────────────────

export const FLOW_TYPES = {
	APPLICATION: 'application',
	COURSE: 'course',
} as const

export const INPUT_TYPES = {
	TEXT: 'text',
	SELECT: 'select',
	PHONE: 'phone',
	PHOTO: 'photo',
	FILE_OPTIONAL: 'file_optional',
} as const

export const COURSE_SCHEDULE_OPTIONS = {
	days: [
		{ value: 'MON_WED', uz: 'Dushanba / Chorshanba', ru: 'Понедельник / Среда' },
		{ value: 'TUE_THU', uz: 'Seshanba / Payshanba', ru: 'Вторник / Четверг' },
		{ value: 'SAT_SUN', uz: 'Shanba / Yakshanba', ru: 'Суббота / Воскресенье' },
	],
	time: [
		{ value: '9_11', uz: '09:00 – 11:00', ru: '09:00 – 11:00' },
		{ value: '14_16', uz: '14:00 – 16:00', ru: '14:00 – 16:00' },
		{ value: '16_18', uz: '16:00 – 18:00', ru: '16:00 – 18:00' },
	],
} as const

export const DEFAULT_APPLICATION_QUESTIONS = [
	{
		key: 'full_name',
		uz: 'Ism va familiyangizni kiriting.',
		ru: 'Введите имя и фамилию.',
		input: INPUT_TYPES.TEXT,
		options: [],
	},
	{
		key: 'birth_date',
		uz: 'Tug\'ilgan sanangizni kiriting (KK.OO.YYYY).',
		ru: 'Введите дату рождения (ДД.ММ.ГГГГ).',
		input: INPUT_TYPES.TEXT,
		options: [],
	},
	{
		key: 'address',
		uz: 'Yashash manzilingizni kiriting.',
		ru: 'Введите адрес проживания.',
		input: INPUT_TYPES.TEXT,
		options: [],
	},
	{
		key: 'phone_number',
		uz: 'Telefon raqamingizni yuboring.',
		ru: 'Отправьте номер телефона.',
		input: INPUT_TYPES.PHONE,
		options: [],
	},
	{
		key: 'family_status',
		uz: 'Oilaviy holatingizni tanlang.',
		ru: 'Выберите семейное положение.',
		input: INPUT_TYPES.SELECT,
		options: [
			{ value: 'single', uz: 'Turmush qurmagan', ru: 'Не женат / не замужем' },
			{ value: 'married', uz: 'Uylangan / turmush qurgan', ru: 'Женат / замужем' },
			{ value: 'divorced', uz: 'Ajrashgan', ru: 'Разведён(а)' },
		],
	},
	{
		key: 'last_education',
		uz: 'Oxirgi ta\'lim darajangizni tanlang.',
		ru: 'Выберите последний уровень образования.',
		input: INPUT_TYPES.SELECT,
		options: [
			{ value: 'school', uz: 'Maktab', ru: 'Школа' },
			{ value: 'college', uz: 'Kollej / litsey', ru: 'Колледж / лицей' },
			{ value: 'higher', uz: 'Oliy ta\'lim', ru: 'Высшее образование' },
		],
	},
	{
		key: 'work_experience',
		uz: 'Oldin qayerda ishlagansiz?',
		ru: 'Где вы работали ранее?',
		input: INPUT_TYPES.TEXT,
		options: [],
	},
	{
		key: 'photo',
		uz: 'Beldan tepaga tushgan aniq rasm yuboring.',
		ru: 'Отправьте чёткое фото по пояс.',
		input: INPUT_TYPES.PHOTO,
		options: [],
	},
] as const
