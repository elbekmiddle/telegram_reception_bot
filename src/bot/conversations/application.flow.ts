import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, InputFile } from 'grammy'
import type { BotContext } from '../bot'
import { vacancyService } from '../../services/vacancy.service'
import { applicationService } from '../../services/application.service'
import { photoService } from '../../services/photo.service'
import { logger } from '../../utils/logger'
import {
	askText,
	askPhone,
	askInline,
	askPhoto,
	askMultiSelect,
	replaceBotMessage,
	isNavSignal,
	navError,
	type NavSignal
} from './flow-helpers'
import { directSendPhoto, directSendMessage } from './direct-api'

// Add this helper function
function escapeMarkdown(text: string): string {
	if (!text) return text
	// Escape special characters for Markdown
	return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1')
}

async function handleNavSignal(
	ctx: BotContext,
	applicationId: string,
	signal: NavSignal
): Promise<'CONTINUE' | 'RETURN'> {
	if (signal === 'CANCEL') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await replaceBotMessage(
			ctx,
			'❌ *Anketa bekor qilindi.*\n\nQaytadan boshlash uchun /start bosing.',
			{ parse_mode: 'Markdown' }
		)
		return 'RETURN'
	}

	if (signal === 'START') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await ctx.conversation.exit()
		await ctx.conversation.enter('applicationFlow')
		return 'RETURN'
	}

	if (signal === 'ADMIN') {
		await applicationService.cancelApplication(applicationId)
		ctx.session.applicationId = undefined
		ctx.session.temp = {} as any
		ctx.session.lastBotMessageId = undefined
		await ctx.conversation.exit()
		await ctx.conversation.enter('adminFlow')
		return 'RETURN'
	}

	return 'CONTINUE'
}

/**
 * Send demo photo if available
 */
async function sendDemoPhoto(ctx: BotContext): Promise<void> {
	const chatId = ctx.chat?.id

	if (!chatId) {
		logger.warn('No chat ID available for sending demo photo')
		return
	}

	try {
		const demoBuffer = await photoService.getDemoPhotoBuffer()

		if (demoBuffer) {
			// DEMO RASM BOR - rasm bilan yuboramiz
			try {
				await directSendPhoto(chatId, demoBuffer, {
					caption: '📸 *Demo rasm* - Shunday rasm yuklang',
					parse_mode: 'Markdown'
				})
				logger.info('Demo photo sent successfully via direct API')
			} catch (directErr) {
				logger.warn({ err: directErr }, 'Direct photo send failed, trying regular API')
				try {
					await ctx.api.sendPhoto(chatId, new InputFile(demoBuffer), {
						caption: '📸 *Demo rasm* - Shunday rasm yuklang',
						parse_mode: 'Markdown'
					})
				} catch (apiErr) {
					logger.warn({ err: apiErr }, 'Regular API also failed, sending text only')
					await ctx.api.sendMessage(
						chatId,
						'📸 *Rasm talablari:*\n\n' +
							"• Beldan yuqori qismingiz ko'rinishi kerak\n" +
							"• Yuzingiz aniq ko'rinishi shart\n" +
							"• Rasmiyroq kiyimda bo'lganingiz ma'qul",
						{ parse_mode: 'Markdown' }
					)
				}
			}
		} else {
			// DEMO RASM YO'Q - faqat matnli xabar
			logger.info('No demo photo available, sending text instructions only')
			try {
				await directSendMessage(
					chatId,
					'📸 *Rasm talablari:*\n\n' +
						"• Beldan yuqori qismingiz ko'rinishi kerak\n" +
						"• Yuzingiz aniq ko'rinishi shart\n" +
						"• Rasmiyroq kiyimda bo'lganingiz ma'qul",
					{ parse_mode: 'Markdown' }
				)
			} catch (directErr) {
				await ctx.api.sendMessage(
					chatId,
					'📸 *Rasm talablari:*\n\n' +
						"• Beldan yuqori qismingiz ko'rinishi kerak\n" +
						"• Yuzingiz aniq ko'rinishi shart\n" +
						"• Rasmiyroq kiyimda bo'lganingiz ma'qul",
					{ parse_mode: 'Markdown' }
				)
			}
		}
	} catch (err) {
		logger.warn({ err }, 'Failed to send demo photo, sending text instructions')
		try {
			await ctx.api.sendMessage(
				chatId,
				'📸 *Rasm talablari:*\n\n' +
					"• Beldan yuqori qismingiz ko'rinishi kerak\n" +
					"• Yuzingiz aniq ko'rinishi shart\n" +
					"• Rasmiyroq kiyimda bo'lganingiz ma'qul",
				{ parse_mode: 'Markdown' }
			)
		} catch {
			logger.error('Failed to send even text instructions')
		}
	}
}

export async function applicationFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return

	try {
		if (!ctx.session.temp) {
			ctx.session.temp = {} as any
		}

		if (!ctx.session.applicationId) {
			const app = await applicationService.createApplication(telegramId)
			ctx.session.applicationId = app.id

			await replaceBotMessage(
				ctx,
				[
					"✨ *Assalomu alaykum! Anketa to'ldirishni boshlaymiz*",
					'',
					'Savollarga javob berish orqali ishga qabul jarayonini boshlaysiz.',
					"Har bir savolga to'g'ri va to'liq javob bering.",
					'',
					'Boshlash uchun birinchi savolga javob bering 👇'
				].join('\n'),
				{ parse_mode: 'Markdown' }
			)
		}

		const applicationId = ctx.session.applicationId!

		// Step 1: Select Vacancy
		if (!ctx.session.temp.vacancyId) {
			const vacancies = await vacancyService.listActive()

			if (vacancies.length === 0) {
				await replaceBotMessage(ctx, "❌ Hozirda faol vakansiyalar yo'q. Keyinroq urinib ko'ring.")
				return
			}

			const buttons = vacancies.map(v => ({
				text: v.title + (v.salary ? ` (${v.salary})` : ''),
				data: `VAC|${v.id}`
			}))

			const picked = await askInline(
				conversation,
				ctx,
				'📌 *Qaysi vakansiyaga ariza topshirasiz?*',
				buttons,
				{ cancel: true, columns: 1 }
			)

			const vacancyId = picked.replace('VAC|', '')
			ctx.session.temp.vacancyId = vacancyId
			await applicationService.setVacancy(applicationId, vacancyId)
		}

		const vacancyId = ctx.session.temp.vacancyId!
		const vacancy = await vacancyService.getWithQuestions(vacancyId)

		if (!vacancy) {
			await replaceBotMessage(ctx, '❌ Vakansiya topilmadi.')
			return
		}

		// Step 2: Ask Name
		if (!ctx.session.temp.fullName) {
			const name = await askText(
				conversation,
				ctx,
				'👤 *Ism, familiyangizni kiriting:*\n\nMasalan: *Alisher Karimov*',
				{ cancel: true }
			)

			ctx.session.temp.fullName = name.trim()
		}

		// Step 3: Ask Phone
		if (!ctx.session.temp.phone) {
			const phone = await askPhone(
				conversation,
				ctx,
				'📞 *Telefon raqamingizni kiriting:*\n\n' +
					'Raqamingizni yozing (masalan: *+998901234567*) yoki quyidagi tugma orqali yuboring 👇',
				{ back: false, cancel: true }
			)

			ctx.session.temp.phone = phone.trim()
		}

		// Step 4: Ask Photo (with demo)
		if (!ctx.session.temp.photoFileId) {
			await sendDemoPhoto(ctx)

			const photoFileId = await askPhoto(
				conversation,
				ctx,
				"📸 *Endi o'zingizning rasmingizni yuboring*\n\n" +
					"Beldan yuqori, yuzingiz aniq ko'rinishi shart 👆"
			)

			ctx.session.temp.photoFileId = photoFileId
			await applicationService.saveFile(applicationId, 'HALF_BODY' as any, photoFileId)
			await replaceBotMessage(ctx, '✅ Rasm qabul qilindi!')
		}

		// Step 5: Ask vacancy questions
		if (vacancy.questions && vacancy.questions.length > 0) {
			if (!ctx.session.temp.vacancyAnswers) {
				ctx.session.temp.vacancyAnswers = {}
			}

			for (const question of vacancy.questions) {
				const questionKey = `q_${question.id}`

				if (ctx.session.temp.vacancyAnswers[questionKey]) {
					continue
				}

				if (question.type === 'TEXT') {
					const answer = await askText(conversation, ctx, `❓ *${question.question}*`, {
						back: false,
						cancel: true
					})
					ctx.session.temp.vacancyAnswers[questionKey] = answer
				} else if (question.type === 'SINGLE_SELECT') {
					if (!question.options || question.options.length === 0) continue

					const buttons = question.options.map(opt => ({
						text: opt.text,
						data: opt.value
					}))

					const answer = await askInline(conversation, ctx, `❓ *${question.question}*`, buttons, {
						back: false,
						cancel: true,
						columns: 2
					})
					ctx.session.temp.vacancyAnswers[questionKey] = answer
				} else if (question.type === 'MULTI_SELECT') {
					if (!question.options || question.options.length === 0) continue

					const options = question.options.map(opt => ({
						key: opt.value,
						label: opt.text
					}))

					const answer = await askMultiSelect(
						conversation,
						ctx,
						`❓ *${question.question}*\n\n(Bir nechta tanlashingiz mumkin)`,
						options,
						new Set<string>(),
						{ back: false, cancel: true }
					)
					ctx.session.temp.vacancyAnswers[questionKey] = Array.from(answer).join(', ')
				}
			}
		}

		// Step 6: Review and Submit (SINGLE BLOCK)
		let summary = [
			'📄 *Anketa tayyor!*',
			'',
			'*Maʼlumotlaringiz:*',
			`👤 Ism: ${escapeMarkdown(ctx.session.temp.fullName || '')}`,
			`📞 Telefon: ${escapeMarkdown(ctx.session.temp.phone || '')}`,
			`📌 Vakansiya: ${escapeMarkdown(vacancy.title || '')}`,
			''
		]

		if (
			ctx.session.temp.vacancyAnswers &&
			Object.keys(ctx.session.temp.vacancyAnswers).length > 0
		) {
			summary.push('*Savollar:*')
			for (const question of vacancy.questions) {
				const questionKey = `q_${question.id}`
				const answer = ctx.session.temp.vacancyAnswers[questionKey]
				if (answer) {
					const safeQuestion = escapeMarkdown(question.question || '')
					const safeAnswer = escapeMarkdown(answer)
					summary.push(`• ${safeQuestion}: ${safeAnswer}`)
				}
			}
			summary.push('')
		}

		summary.push('Tasdiqlaysizmi?')

		// Send summary with inline keyboard
		const sentMsg = await ctx.reply(summary.join('\n'), {
			parse_mode: 'Markdown',
			reply_markup: new InlineKeyboard()
				.text('✅ Tasdiqlash', 'CONFIRM|SUBMIT')
				.text('❌ Bekor qilish', 'NAV|CANCEL')
		})

		ctx.session.lastBotMessageId = sentMsg.message_id

		// Wait for callback
		const confirmation = await conversation.waitFor('callback_query:data')

		if (confirmation.callbackQuery) {
			const data = confirmation.callbackQuery.data
			await confirmation.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|CANCEL') {
				throw navError('CANCEL')
			}

			if (data === 'CONFIRM|SUBMIT') {
				// Save answers
				await applicationService.saveAnswer(
					applicationId,
					'full_name',
					ctx.session.temp.fullName,
					'TEXT' as any
				)

				await applicationService.saveAnswer(
					applicationId,
					'phone',
					ctx.session.temp.phone,
					'PHONE' as any
				)

				if (ctx.session.temp.vacancyAnswers) {
					for (const [key, value] of Object.entries(ctx.session.temp.vacancyAnswers)) {
						await applicationService.saveAnswer(applicationId, key, String(value), 'TEXT' as any)
					}
				}

				await applicationService.submitApplication(applicationId)

				// Notify admin
				const adminChatId = Number(process.env.ADMIN_CHAT_ID)
				if (adminChatId) {
					let adminMessage = [
						`🆕 *Yangi ariza #${escapeMarkdown(applicationId.slice(0, 8))}*`,
						'',
						`👤 Ism: ${escapeMarkdown(ctx.session.temp.fullName || '')}`,
						`📞 Telefon: ${escapeMarkdown(ctx.session.temp.phone || '')}`,
						`📌 Vakansiya: ${escapeMarkdown(vacancy.title || '')}`,
						''
					]

					if (
						ctx.session.temp.vacancyAnswers &&
						Object.keys(ctx.session.temp.vacancyAnswers).length > 0
					) {
						adminMessage.push('*Javoblar:*')
						for (const question of vacancy.questions) {
							const questionKey = `q_${question.id}`
							const answer = ctx.session.temp.vacancyAnswers[questionKey]
							if (answer) {
								const safeQuestion = escapeMarkdown(question.question || '')
								const safeAnswer = escapeMarkdown(answer)
								adminMessage.push(`• ${safeQuestion}: ${safeAnswer}`)
							}
						}
					}

					const adminKb = new InlineKeyboard()
						.text('✅ Qabul qilish', `AD|APPROVE|${applicationId}`)
						.text('❌ Rad etish', `AD|REJECT|${applicationId}`)

					try {
						if (ctx.session.temp.photoFileId) {
							await ctx.api.sendPhoto(adminChatId, ctx.session.temp.photoFileId, {
								caption: adminMessage.join('\n'),
								parse_mode: 'Markdown',
								reply_markup: adminKb
							})
						} else {
							await ctx.api.sendMessage(adminChatId, adminMessage.join('\n'), {
								parse_mode: 'Markdown',
								reply_markup: adminKb
							})
						}
					} catch (err) {
						logger.error({ err }, 'Failed to notify admin')
					}
				}

				// Confirm to user
				await ctx.reply(
					[
						'✅ *Anketa topshirildi!*',
						'',
						'Sizning anketangiz qabul qilindi.',
						"Tez orada adminlar bog'lanadi.",
						'',
						'Rahmat! 🙏'
					].join('\n'),
					{ parse_mode: 'Markdown' }
				)

				// Clear session and exit
				ctx.session.applicationId = undefined
				ctx.session.temp = {} as any
				await ctx.conversation.exit()
				return
			}
		}
	} catch (err) {
		if (isNavSignal(err)) {
			const signal = err.message as NavSignal
			if (ctx.session.applicationId) {
				const result = await handleNavSignal(ctx, ctx.session.applicationId, signal)
				if (result === 'RETURN') {
					return
				}
			}
		}

		logger.error({ err, userId: ctx.from?.id }, 'applicationFlow failed')
		await replaceBotMessage(ctx, "Xatolik yuz berdi. /start bilan qayta urinib ko'ring.")
	}
}
