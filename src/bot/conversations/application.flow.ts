import { conversation } from '@grammyjs/conversations'
import { Context } from '../bot'
import { ConversationHelpers } from './helpers'
import { PhotoStep } from './photo.step'
import { StepKey, EducationType, Certificates, ComputerSkills } from '../../config/constants'
import { applicationService } from '../../services/application.service'
import { adminService } from '../../services/admin.service'
import { Validators } from '../../utils/validators'
import { buildSummary } from '../../utils/format'
import { logger } from '../../utils/logger'

export const applicationFlow = conversation(async (ctx: Context) => {
	try {
		// Yangi application yaratish
		if (!ctx.session.applicationId) {
			const app = await applicationService.createApplication(ctx.from.id)
			ctx.session.applicationId = app.id
		}

		const appId = ctx.session.applicationId

		// 1. Ism familiya
		const fullName = await ConversationHelpers.askText(
			ctx,
			'👤 *Ism va familiyangizni kiriting:*\n\nMasalan: Ali Valiyev',
			{ cancel: true }
		)

		if (!Validators.validateName(fullName)) {
			await ctx.reply("❌ Ism noto'g'ri formatda. Faqat harflar va bo'shliq bo'lishi mumkin.")
			return await ctx.conversation.reenter()
		}

		await applicationService.saveAnswer(appId, 'full_name', fullName, 'TEXT')
		ctx.session.history.push(StepKey.PERSON_FULL_NAME)

		// 2. Tug'ilgan sana
		const birthDateKeyboard = [
			{ text: '✏️ Kiritaman', data: 'BIRTH|ENTER' },
			{ text: "⏭️ O'tkazib yuboraman", data: 'BIRTH|SKIP' }
		]

		const birthChoice = await ConversationHelpers.askInline(
			ctx,
			"📅 *Tug'ilgan sanangizni kiritasizmi?*",
			birthDateKeyboard,
			{ back: true, cancel: true }
		)

		if (birthChoice === 'BIRTH|ENTER') {
			const birthDate = await ConversationHelpers.askText(
				ctx,
				"📅 *Tug'ilgan sanangizni kiriting:*\n\nFormat: DD.MM.YYYY\nMasalan: 15.05.1995",
				{ back: true, cancel: true }
			)

			const validation = Validators.validateBirthDate(birthDate)
			if (!validation.isValid) {
				await ctx.reply(
					"❌ Sana noto'g'ri formatda yoki mavjud emas. Iltimos, qayta urinib ko'ring."
				)
				return await ctx.conversation.reenter()
			}

			await applicationService.saveAnswer(appId, 'birth_date', birthDate, 'DATE')
		}

		// 3. Manzil
		const cities = [
			{ text: 'Toshkent', data: 'ADDR|TASHKENT' },
			{ text: 'Samarqand', data: 'ADDR|SAMARQAND' },
			{ text: 'Buxoro', data: 'ADDR|BUXORO' },
			{ text: "Farg'ona", data: 'ADDR|FARGHONA' },
			{ text: 'Andijon', data: 'ADDR|ANDIJON' },
			{ text: 'Namangan', data: 'ADDR|NAMANGAN' },
			{ text: "Qo'lda kiritish", data: 'ADDR|CUSTOM' }
		]

		const addressChoice = await ConversationHelpers.askInline(
			ctx,
			'📍 *Yashash manzilingiz (shahar/tuman):*',
			cities,
			{ back: true, cancel: true, columns: 2 }
		)

		let address = ''
		if (addressChoice === 'ADDR|CUSTOM') {
			address = await ConversationHelpers.askText(
				ctx,
				'📍 *Manzilingizni kiriting:*\n\nMasalan: Toshkent, Chilonzor tumani',
				{ back: true, cancel: true }
			)
		} else {
			address = addressChoice.replace('ADDR|', '')
		}

		await applicationService.saveAnswer(appId, 'address', address, 'TEXT')

		// 4. Telefon raqam
		const phoneKeyboard = new InlineKeyboard()
			.text('📱 Telefon raqamni yuborish', 'PHONE|CONTACT')
			.row()
			.text("✏️ Qo'lda kiritish", 'PHONE|MANUAL')
			.row()
			.text('⬅️ Orqaga', 'NAV|BACK')
			.text('❌ Bekor qilish', 'NAV|CANCEL')

		await ctx.reply('📞 *Telefon raqamingiz:*', {
			parse_mode: 'Markdown',
			reply_markup: phoneKeyboard
		})

		let phone = ''
		while (true) {
			const response = await ctx.conversation.wait()

			if (response.callbackQuery) {
				await response.answerCallbackQuery()
				const data = response.callbackQuery.data

				if (data === 'NAV|BACK') throw new Error('BACK')
				if (data === 'NAV|CANCEL') throw new Error('CANCEL')

				if (data === 'PHONE|CONTACT') {
					await ctx.reply('Iltimos, "Kontakt yuborish" tugmasini bosing:', {
						reply_markup: {
							keyboard: [[{ text: '📱 Kontakt yuborish', request_contact: true }]],
							resize_keyboard: true,
							one_time_keyboard: true
						}
					})
					continue
				}

				if (data === 'PHONE|MANUAL') {
					const manualPhone = await ConversationHelpers.askText(
						ctx,
						'📞 *Telefon raqamingizni kiriting:*\n\nFormat: +998901234567',
						{ back: true, cancel: true }
					)

					if (!Validators.validatePhone(manualPhone)) {
						await ctx.reply("❌ Telefon raqam noto'g'ri formatda. +998 bilan boshlanishi kerak.")
						continue
					}

					phone = manualPhone
					break
				}
			}

			if (response.message?.contact) {
				phone = response.message.contact.phone_number
				break
			}

			if (response.message?.text && Validators.validatePhone(response.message.text)) {
				phone = response.message.text
				break
			}

			await ctx.reply("❌ Noto'g'ri format. Telefon raqamni +998XXXXXXXXX shaklida yuboring.")
		}

		await applicationService.saveAnswer(appId, 'phone', phone, 'PHONE')

		// 5. Ta'lim turi
		const eduTypes = [
			{ text: '🏫 Maktab', data: 'EDU|SCHOOL' },
			{ text: '🏛️ Kollej', data: 'EDU|COLLEGE' },
			{ text: '🎓 Oliy', data: 'EDU|HIGHER' }
		]

		const eduType = await ConversationHelpers.askInline(
			ctx,
			"🎓 *Oxirgi o'quv yurti turi:*",
			eduTypes,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(
			appId,
			'education_type',
			eduType.replace('EDU|', ''),
			'SINGLE_CHOICE'
		)

		// 6. Mutaxassislik
		const speciality = await ConversationHelpers.askText(
			ctx,
			"📚 *Mutaxassisligingiz:*\n\nQaysi sohada ta'lim olgansiz?",
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'speciality', speciality, 'TEXT')

		// 7. Sertifikatlar
		const certOptions = [
			{ key: 'ENGLISH', label: '🇬🇧 Ingliz tili' },
			{ key: 'RUSSIAN', label: '🇷🇺 Rus tili' },
			{ key: 'ARABIC', label: '🇸🇦 Arab tili' },
			{ key: 'OTHER', label: '➕ Boshqa' }
		]

		const selectedCerts = await ConversationHelpers.askMultiSelect(
			ctx,
			'📜 *Sertifikatlaringiz:*\n\nMavjud sertifikatlarni tanlang (bir nechtasini tanlash mumkin):',
			certOptions,
			new Set(),
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(
			appId,
			'certificates',
			JSON.stringify(Array.from(selectedCerts)),
			'MULTI_CHOICE'
		)

		// 8. Ish tajribasi - kompaniya
		const expCompany = await ConversationHelpers.askText(
			ctx,
			'🏢 *Oldin qayerda ishlagansiz?*\n\nKompaniya nomini kiriting (agar bo\'lmasa "Yo\'q" deb yozing):',
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'exp_company', expCompany, 'TEXT')

		// 9. Ish muddati
		if (expCompany.toLowerCase() !== "yo'q") {
			const durationOptions = [
				{ text: '0-6 oy', data: 'DUR|0_6' },
				{ text: '6-12 oy', data: 'DUR|6_12' },
				{ text: '1-2 yil', data: 'DUR|1_2' },
				{ text: '2+ yil', data: 'DUR|2_PLUS' },
				{ text: "✏️ Qo'lda", data: 'DUR|CUSTOM' }
			]

			const duration = await ConversationHelpers.askInline(
				ctx,
				'⏳ *Qancha muddat ishlagansiz?*',
				durationOptions,
				{ back: true, cancel: true }
			)

			let expDuration = duration
			if (duration === 'DUR|CUSTOM') {
				expDuration = await ConversationHelpers.askText(
					ctx,
					'⏳ *Ishlagan muddatingizni kiriting:*\n\nMasalan: "1 yil 6 oy" yoki "8 oy"',
					{ back: true, cancel: true }
				)

				if (!Validators.validateCustomDuration(expDuration)) {
					await ctx.reply('❌ Noto\'g\'ri format. Masalan: "6 oy" yoki "2 yil"')
					return await ctx.conversation.reenter()
				}
			}

			await applicationService.saveAnswer(appId, 'exp_duration', expDuration, 'TEXT')

			// 10. Lavozim
			const position = await ConversationHelpers.askText(ctx, '👔 *Qaysi lavozimda ishlagansiz?*', {
				back: true,
				cancel: true
			})

			await applicationService.saveAnswer(appId, 'exp_position', position, 'TEXT')

			// 11. Ishdan ketish sababi
			const reasonOptions = [
				{ text: "📚 O'qish", data: 'REASON|STUDY' },
				{ text: '💰 Oylik', data: 'REASON|SALARY' },
				{ text: '🏢 Sharoit', data: 'REASON|CONDITIONS' },
				{ text: "🚚 Ko'chish", data: 'REASON|MOVE' },
				{ text: '➕ Boshqa', data: 'REASON|OTHER' }
			]

			const reason = await ConversationHelpers.askInline(
				ctx,
				'❓ *Ishdan ketish sababi?*',
				reasonOptions,
				{ back: true, cancel: true }
			)

			let leaveReason = reason
			if (reason === 'REASON|OTHER') {
				leaveReason = await ConversationHelpers.askText(
					ctx,
					'✏️ *Ishdan ketish sababingizni yozing:*',
					{ back: true, cancel: true }
				)
			}

			await applicationService.saveAnswer(appId, 'exp_leave_reason', leaveReason, 'TEXT')
		}

		// 12. Qancha muddat ishlay oladi
		const workDurationOptions = [
			{ text: '3 oy', data: 'WORK|3_MONTHS' },
			{ text: '6 oy', data: 'WORK|6_MONTHS' },
			{ text: '1 yil', data: 'WORK|1_YEAR' },
			{ text: 'Uzoq muddat', data: 'WORK|LONG' },
			{ text: 'Aniqlash kerak', data: 'WORK|UNKNOWN' }
		]

		const workDuration = await ConversationHelpers.askInline(
			ctx,
			'⏱️ *Biz bilan qancha muddat ishlay olasiz?*',
			workDurationOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'can_work_duration', workDuration, 'SINGLE_CHOICE')

		// 13. Kompyuter ko'nikmalari
		const skillOptions = [
			{ key: 'WORD', label: '📝 Word' },
			{ key: 'EXCEL', label: '📊 Excel' },
			{ key: 'TELEGRAM', label: '📱 Telegram' },
			{ key: 'CRM', label: '📋 CRM' },
			{ key: 'GOOGLE_SHEETS', label: '📈 Google Sheets' }
		]

		const selectedSkills = await ConversationHelpers.askMultiSelect(
			ctx,
			"💻 *Kompyuter ko'nikmalari:*\n\nQaysi dasturlarni bilasiz?",
			skillOptions,
			new Set(),
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(
			appId,
			'computer_skills',
			JSON.stringify(Array.from(selectedSkills)),
			'MULTI_CHOICE'
		)

		// 14. Muloqot qobiliyati
		const commOptions = [
			{ text: '🔴 Past', data: 'COMM|LOW' },
			{ text: "🟡 O'rtacha", data: 'COMM|MEDIUM' },
			{ text: '🟢 Yaxshi', data: 'COMM|GOOD' },
			{ text: '💚 Juda yaxshi', data: 'COMM|EXCELLENT' }
		]

		const communication = await ConversationHelpers.askInline(
			ctx,
			'🗣️ *Muloqot qobiliyatingizni qanday baholaysiz?*',
			commOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(
			appId,
			'communication_skill',
			communication,
			'SINGLE_CHOICE'
		)

		// 15. Telefon qo'ng'iroqlariga javob bera oladimi?
		const callOptions = [
			{ text: '✅ Ha', data: 'CALLS|YES' },
			{ text: "❌ Yo'q", data: 'CALLS|NO' }
		]

		const canAnswerCalls = await ConversationHelpers.askInline(
			ctx,
			"📞 *Telefon qo'ng'iroqlariga javob bera olasizmi?*",
			callOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'can_answer_calls', canAnswerCalls, 'SINGLE_CHOICE')

		// 16. Mijozlar bilan tajriba
		const clientExpOptions = [
			{ text: '✅ Ha', data: 'CLIENT|YES' },
			{ text: "❌ Yo'q", data: 'CLIENT|NO' }
		]

		const clientExp = await ConversationHelpers.askInline(
			ctx,
			'🤝 *Mijozlar bilan ishlash tajribangiz bormi?*',
			clientExpOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'client_experience', clientExp, 'SINGLE_CHOICE')

		// 17. Kiyinish madaniyati
		const dressOptions = [
			{ text: '✅ Ha', data: 'DRESS|YES' },
			{ text: "❌ Yo'q", data: 'DRESS|NO' }
		]

		const dressCode = await ConversationHelpers.askInline(
			ctx,
			"👔 *Kiyinish madaniyatiga e'tibor berasizmi?*",
			dressOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'dress_code', dressCode, 'SINGLE_CHOICE')

		// 18. Stressga chidamlilik
		const stressOptions = [
			{ text: '🔴 Past', data: 'STRESS|LOW' },
			{ text: "🟡 O'rtacha", data: 'STRESS|MEDIUM' },
			{ text: '🟢 Yaxshi', data: 'STRESS|GOOD' }
		]

		const stressTolerance = await ConversationHelpers.askInline(
			ctx,
			'💪 *Stressga chidamliligingiz qanday?*',
			stressOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'stress_tolerance', stressTolerance, 'SINGLE_CHOICE')

		// 19. Ish stavkasi
		const shiftOptions = [
			{ text: "⚡ To'liq stavka", data: 'SHIFT|FULL' },
			{ text: '🕐 Yarim stavka', data: 'SHIFT|PART' }
		]

		const workShift = await ConversationHelpers.askInline(
			ctx,
			'⏰ *Qanday stavkada ishlashni xohlaysiz?*',
			shiftOptions,
			{ back: true, cancel: true }
		)

		await applicationService.saveAnswer(appId, 'work_shift', workShift, 'SINGLE_CHOICE')

		// 20. Oylik kutilmasi
		const salaryOptions = [
			{ text: '2-3 mln', data: 'SALARY|2_3' },
			{ text: '3-4 mln', data: 'SALARY|3_4' },
			{ text: '4-5 mln', data: 'SALARY|4_5' },
			{ text: '5-7 mln', data: 'SALARY|5_7' },
			{ text: '7+ mln', data: 'SALARY|7_PLUS' },
			{ text: "✏️ Qo'lda", data: 'SALARY|CUSTOM' }
		]

		const salary = await ConversationHelpers.askInline(
			ctx,
			'💰 *Oylik maosh kutmangiz?*',
			salaryOptions,
			{ back: true, cancel: true }
		)

		let expectedSalary = salary
		if (salary === 'SALARY|CUSTOM') {
			expectedSalary = await ConversationHelpers.askText(
				ctx,
				'💰 *Oylik maosh kutmangizni kiriting:*\n\nMasalan: 4000000',
				{ back: true, cancel: true }
			)

			if (!Validators.validateSalary(expectedSalary)) {
				await ctx.reply("❌ Noto'g'ri format. Faqat son kiriting.")
				return await ctx.conversation.reenter()
			}
		}

		await applicationService.saveAnswer(appId, 'expected_salary', expectedSalary, 'TEXT')

		// 21. Qachondan boshlaydi
		const startOptions = [
			{ text: '📅 Bugun', data: 'START|TODAY' },
			{ text: '📅 Ertaga', data: 'START|TOMORROW' },
			{ text: '📅 Hafta ichida', data: 'START|WEEK' },
			{ text: '✏️ Sana kiritish', data: 'START|CUSTOM' }
		]

		const startChoice = await ConversationHelpers.askInline(
			ctx,
			'🚀 *Qachondan ish boshlay olasiz?*',
			startOptions,
			{ back: true, cancel: true }
		)

		let startDate = startChoice
		if (startChoice === 'START|CUSTOM') {
			startDate = await ConversationHelpers.askText(
				ctx,
				'📅 *Boshlash sanasini kiriting:*\n\nFormat: DD.MM.YYYY',
				{ back: true, cancel: true }
			)

			const validation = Validators.validateBirthDate(startDate) // reuse date validator
			if (!validation.isValid) {
				await ctx.reply("❌ Sana noto'g'ri formatda.")
				return await ctx.conversation.reenter()
			}
		}

		await applicationService.saveAnswer(appId, 'start_date', startDate, 'DATE')

		// 22. Belidan yuqori rasm
		try {
			const photoFileId = await PhotoStep.handle(ctx)
			await applicationService.saveFile(appId, 'HALF_BODY', photoFileId, {
				uploadedAt: new Date().toISOString()
			})
		} catch (error: any) {
			if (error.message === 'BACK') throw error
			if (error.message === 'CANCEL') throw error
			throw error
		}

		// 23. Pasport (ixtiyoriy)
		const passportKeyboard = new InlineKeyboard()
			.text('✅ Ha, yuboraman', 'PASSPORT|YES')
			.text("⏭️ O'tkazib yuboraman", 'PASSPORT|SKIP')
			.row()
			.text('⬅️ Orqaga', 'NAV|BACK')
			.text('❌ Bekor qilish', 'NAV|CANCEL')

		await ctx.reply("🪪 *Pasport nusxasi (ixtiyoriy)*\n\nKerak bo'lsa yuborishingiz mumkin:", {
			parse_mode: 'Markdown',
			reply_markup: passportKeyboard
		})

		const passportResponse = await ctx.conversation.wait()
		if (passportResponse.callbackQuery) {
			await passportResponse.answerCallbackQuery()
			const data = passportResponse.callbackQuery.data

			if (data === 'PASSPORT|YES') {
				await ctx.reply('Pasport rasmini yuboring:')
				const passportPhoto = await ctx.conversation.wait()

				if (passportPhoto.message?.photo) {
					const fileId = passportPhoto.message.photo[passportPhoto.message.photo.length - 1].file_id
					await applicationService.saveFile(appId, 'PASSPORT', fileId)
				}
			}
		}

		// 24. Tavsiyanoma
		const recommKeyboard = new InlineKeyboard()
			.text('✅ Ha', 'REC|YES')
			.text("❌ Yo'q", 'REC|NO')
			.row()
			.text('⬅️ Orqaga', 'NAV|BACK')
			.text('❌ Bekor qilish', 'NAV|CANCEL')

		await ctx.reply('📄 *Tavsiyanomangiz bormi?*', {
			parse_mode: 'Markdown',
			reply_markup: recommKeyboard
		})

		const recommResponse = await ctx.conversation.wait()
		if (recommResponse.callbackQuery) {
			await recommResponse.answerCallbackQuery()
			const data = recommResponse.callbackQuery.data

			if (data === 'REC|YES') {
				await ctx.reply('Tavsiyanoma faylini yuboring (rasm yoki hujjat):')
				const recommFile = await ctx.conversation.wait()

				if (recommFile.message?.photo || recommFile.message?.document) {
					const fileId = recommFile.message.photo
						? recommFile.message.photo[recommFile.message.photo.length - 1].file_id
						: recommFile.message.document!.file_id

					await applicationService.saveFile(appId, 'RECOMMENDATION', fileId)
				}
			}
		}

		// 25. Tasdiqlash
		const summary = await buildSummary(appId)

		const confirmKeyboard = new InlineKeyboard()
			.text('✅ Tasdiqlash', 'CONFIRM|SUBMIT')
			.text('✏️ Tahrirlash', 'CONFIRM|EDIT')
			.row()
			.text('❌ Bekor qilish', 'NAV|CANCEL')

		await ctx.reply(`📋 *Anketangiz tayyor:*\n\n${summary}`, {
			parse_mode: 'Markdown',
			reply_markup: confirmKeyboard
		})

		const confirmResponse = await ctx.conversation.wait()
		if (confirmResponse.callbackQuery) {
			await confirmResponse.answerCallbackQuery()
			const data = confirmResponse.callbackQuery.data

			if (data === 'CONFIRM|SUBMIT') {
				// Anketani yakunlash
				await applicationService.submitApplication(appId)

				// Adminlarga yuborish
				await adminService.sendToAdmin(ctx, appId)

				await ctx.reply(
					'✅ *Anketangiz muvaffaqiyatli topshirildi!*\n\n' +
						"Tez orada administratorlarimiz siz bilan bog'lanadi.",
					{ parse_mode: 'Markdown' }
				)
			} else if (data === 'CONFIRM|EDIT') {
				await ctx.reply('Tahrirlash funksiyasi tez orada ishga tushadi.')
				// TODO: Edit mode
			}
		}
	} catch (error: any) {
		if (error.message === 'BACK') {
			// Orqaga qaytish
			if (ctx.session.history.length > 0) {
				ctx.session.currentStep = ctx.session.history.pop()!
				await ctx.reply('⬅️ Oldingi bosqichga qaytildi.')
				return await ctx.conversation.reenter()
			}
		} else if (error.message === 'CANCEL') {
			// Bekor qilish
			if (ctx.session.applicationId) {
				await applicationService.cancelApplication(ctx.session.applicationId)
			}
			await ctx.reply("❌ Anketa bekor qilindi. /start buyrug'i bilan qaytadan boshlang.")
			return
		} else {
			logger.error({ error }, 'Application flow error')
			await ctx.reply("Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.")
		}
	}
})
