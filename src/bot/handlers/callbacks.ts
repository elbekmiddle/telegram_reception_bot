import { Bot } from 'grammy'
import { Context } from '../bot'
import { applicationService } from '../../services/application.service'
import { logger } from '../../utils/logger'
import { StepKey } from '../../config/constants'

export function setupCallbackHandlers(bot: Bot<Context>) {
	// Navigation callbacks
	bot.callbackQuery(/^NAV\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data

			if (data === 'NAV|RESUME') {
				await ctx.conversations.enter('applicationFlow')
			} else if (data === 'NAV|RESTART') {
				if (ctx.session.applicationId) {
					await applicationService.cancelApplication(ctx.session.applicationId)
				}

				// Reset session
				ctx.session = {
					currentStep: StepKey.PERSON_FULL_NAME,
					history: [],
					temp: {},
					createdAt: Date.now(),
					lastActivity: Date.now()
				}

				await ctx.conversations.enter('applicationFlow')
			} else if (data === 'NAV|BACK') {
				await ctx.reply('⬅️ Orqaga qaytish...')
			} else if (data === 'NAV|CANCEL') {
				await ctx.reply('❌ Bekor qilindi. /start bilan qaytadan boshlang.')
			}
		} catch (error) {
			logger.error({ error, userId: ctx.from?.id }, 'Navigation callback error')
			await ctx.reply('Xatolik yuz berdi.')
		}
	})

	// Photo callbacks
	bot.callbackQuery(/^PHOTO\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
			const data = ctx.callbackQuery.data

			if (data === 'PHOTO|RETRY') {
				await ctx.reply('Iltimos, rasmni qayta yuboring:')
			} else if (data === 'PHOTO|RULES') {
				await ctx.reply(
					'📸 *Rasm qoidalari:*\n\n' +
						"• Belidan yuqori qismi ko'rinishi kerak\n" +
						"• Yuz aniq bo'lishi kerak\n" +
						"• Fon oddiy bo'lishi kerak\n" +
						"• Rasm aniq va yorug' bo'lishi kerak",
					{ parse_mode: 'Markdown' }
				)
			}
		} catch (error) {
			logger.error({ error }, 'Photo callback error')
		}
	})

	// Birth date callbacks
	bot.callbackQuery(/^BIRTH\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Birth callback error')
		}
	})

	// Address callbacks
	bot.callbackQuery(/^ADDR\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Address callback error')
		}
	})

	// Phone callbacks
	bot.callbackQuery(/^PHONE\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Phone callback error')
		}
	})

	// Education callbacks
	bot.callbackQuery(/^EDU\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Education callback error')
		}
	})

	// Duration callbacks
	bot.callbackQuery(/^DUR\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Duration callback error')
		}
	})

	// Reason callbacks
	bot.callbackQuery(/^REASON\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Reason callback error')
		}
	})

	// Work callbacks
	bot.callbackQuery(/^WORK\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Work callback error')
		}
	})

	// Communication callbacks
	bot.callbackQuery(/^COMM\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Communication callback error')
		}
	})

	// Calls callbacks
	bot.callbackQuery(/^CALLS\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Calls callback error')
		}
	})

	// Client callbacks
	bot.callbackQuery(/^CLIENT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Client callback error')
		}
	})

	// Dress callbacks
	bot.callbackQuery(/^DRESS\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Dress callback error')
		}
	})

	// Stress callbacks
	bot.callbackQuery(/^STRESS\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Stress callback error')
		}
	})

	// Shift callbacks
	bot.callbackQuery(/^SHIFT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Shift callback error')
		}
	})

	// Salary callbacks
	bot.callbackQuery(/^SALARY\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Salary callback error')
		}
	})

	// Start date callbacks
	bot.callbackQuery(/^START\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Start date callback error')
		}
	})

	// Passport callbacks
	bot.callbackQuery(/^PASSPORT\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Passport callback error')
		}
	})

	// Recommendation callbacks
	bot.callbackQuery(/^REC\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Recommendation callback error')
		}
	})

	// Confirm callbacks
	bot.callbackQuery(/^CONFIRM\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()

			if (ctx.callbackQuery.data === 'CONFIRM|SUBMIT') {
				await ctx.reply('✅ Anketa topshirildi!')
			} else if (ctx.callbackQuery.data === 'CONFIRM|EDIT') {
				await ctx.reply('✏️ Anketani tahrirlash...')
			}
		} catch (error) {
			logger.error({ error }, 'Confirm callback error')
		}
	})

	// Multi-select callbacks
	bot.callbackQuery(/^M\|/, async ctx => {
		try {
			await ctx.answerCallbackQuery()
		} catch (error) {
			logger.error({ error }, 'Multi-select callback error')
		}
	})
}
