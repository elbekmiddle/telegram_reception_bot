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
	MIN_WIDTH: 600,
	MIN_HEIGHT: 800,
	MIN_RATIO: 0.6,
	MAX_RATIO: 0.9,
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
	ADMIN_REJECT: 'AD|REJECT'
} as const
