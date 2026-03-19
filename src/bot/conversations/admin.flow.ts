import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, InputFile } from 'grammy'
import fs from 'node:fs'
import path from 'node:path'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'
import { askText, askChoice, replaceBotMessage, navError, isNavSignal, escapeMarkdown, deletePrevBotMessage } from './flow-helpers'
import { showStartMenu } from '../start.menu'
import { exportToExcel } from '../../utils/excel-export'
import { photoService } from '../../services/photo.service'
import { FileType } from '../../generated/prisma/client'
import { CallbackData } from '../../config/constants'
import { runtimeSettingsService } from '../../services/runtime-settings.service'
import { getUserLang } from '../../utils/i18n'
import { manageApplicationsBrowser } from './admin-applications.browser'
import { manageCourseEnrollmentsBrowser } from './admin-enrollments.browser'

type AdminNavSignal = 'START' | 'ADMIN'

const adminNavError = (sig: AdminNavSignal) => new Error(sig)

function adminText(ctx: BotContext, uz: string, ru: string): string {
	return getUserLang(ctx) === 'ru' ? ru : uz
}

function isAdminNavSignal(err: unknown): err is Error {
  return err instanceof Error && (err.message === 'START' || err.message === 'ADMIN')
}

function isAdmin(ctx: BotContext): boolean {
  const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
  const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
  const id = ctx.from?.id
  return Boolean(id && (id === admin1 || id === admin2))
}

// async function uploadCoursePhoto(
//   conversation: Conversation<BotContext>,
//   ctx: BotContext,
//   courseId: string,
//   isEdit: boolean = false
// ): Promise<string | null> {
//   let lastMessageId: number | null = null
//   let loadingMessageId: number | null = null

//   const kb = new InlineKeyboard()
//     .text("📋 Qoidani ko'rsat", CallbackData.COURSE_PHOTO_RULES)
//     .row()
//     .text('⏭ Oʻtkazib yuborish', CallbackData.COURSE_PHOTO_SKIP)
//     .text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

//   const title = isEdit ? 'Kurs rasmini yangilang' : 'Kurs uchun rasm yuklang'
//   const description = isEdit 
//     ? 'Yangi rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
//     : 'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'

//   const sentMsg = await ctx.reply(
//     [
//       `📸 *${title}*`,
//       '',
//       '✅ *Talablar (ixtiyoriy):*',
//       '• Rasm kurs dizayni uchun ishlatiladi',
//       '• JPG yoki PNG format',
//       '• Rasm kurs haqida maʼlumot berishi mumkin',
//       '',
//       description
//     ].join('\n'),
//     { parse_mode: 'Markdown', reply_markup: kb }
//   )
//   lastMessageId = sentMsg.message_id

//   while (true) {
//     const u = await conversation.wait()

//     if (u.callbackQuery) {
//       const data = u.callbackQuery.data
//       if (!data) continue

//       await u.answerCallbackQuery().catch(() => {})

//       if (data === CallbackData.NAV_CANCEL) throw navError('CANCEL')
//       if (data === CallbackData.COURSE_PHOTO_SKIP) {
//         if (isEdit) {
//           await ctx.reply('⏭ Kurs rasmi oʻzgartirilmadi')
//         } else {
//           await ctx.reply('⏭ Kurs rasmi yuklanmadi (ixtiyoriy)')
//         }
//         return null
//       }

//       if (data === CallbackData.COURSE_PHOTO_RULES) {
//         if (lastMessageId) {
//           try {
//             await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
//           } catch (error) {
//             // ignore
//           }
//         }

//         const rulesMsg = await ctx.reply(
//           [
//             '📋 *Rasm talablari:*',
//             '',
//             '✅ *Qabul qilinadi:*',
//             '• JPG, PNG formatlari',
//             '• Har qanday oʻlcham',
//             '• Kursga mos rasm',
//             '',
//             '❌ *Qabul qilinmaydi:*',
//             '• Video fayllar',
//             '• Hajmi juda kichik',
//             '',
//             description
//           ].join('\n'),
//           { parse_mode: 'Markdown', reply_markup: kb }
//         )
//         lastMessageId = rulesMsg.message_id
//         continue
//       }
//     }

//     if (u.message?.photo?.length) {
//       const best = u.message.photo[u.message.photo.length - 1]

//       const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
//       loadingMessageId = loadingMsg.message_id

//       try {
//         const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
//           minWidth: 100,
//           minHeight: 100,
//           minRatio: 0.1,
//           maxRatio: 10
//         })

//         if (!validated.ok) {
//           if (loadingMessageId) {
//             try {
//               await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
//             } catch (error) {
//               // ignore
//             }
//           }

//           await ctx.reply(`❌ *Xatolik:*\n${validated.reason}`, {
//             parse_mode: 'Markdown'
//           })
//           continue
//         }

//         const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)

//         if (loadingMessageId) {
//           try {
//             await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
//           } catch (error) {
//             // ignore
//           }
//         }

//         console.log(`✅ Kurs rasmi yuklandi: ${uploaded.secureUrl}`)

//         await ctx.reply(isEdit ? '✅ Kurs rasmi yangilandi!' : '✅ Kurs rasmi muvaffaqiyatli yuklandi!')
//         return uploaded.secureUrl

//       } catch (error) {
//         logger.error({ error }, 'Failed to upload course photo')
        
//         if (loadingMessageId) {
//           try {
//             await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
//           } catch (error) {
//             // ignore
//           }
//         }
        
//         await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
//         continue
//       }
//     }

//     if (u.message?.text) {
//       await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.')
//       continue
//     }
//   }
// }

// admin.flow.ts dagi uploadCoursePhoto funksiyasida

// admin.flow.ts dagi uploadCoursePhoto funksiyasiga eski callbacklarni tozalash qo'shing

// admin.flow.ts dagi uploadCoursePhoto funksiyasi - OPTIMALLASHTIRILGAN

async function uploadCoursePhoto(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string,
  isEdit: boolean = false
): Promise<string | null> {
  let lastMessageId: number | null = null
  let loadingMessageId: number | null = null
  let isProcessing = false // Rasm yuklanayotganligini tekshirish uchun

  // Bu yerda conversation.wait() bilan callback tozalash qilinmaydi. Aks holda yangi rasm update'i yo'qolib qolishi mumkin.

  const kb = new InlineKeyboard()
    .text("📋 Qoidani ko'rsat", CallbackData.COURSE_PHOTO_RULES)
    .row()
    .text('⏭ Oʻtkazib yuborish', CallbackData.COURSE_PHOTO_SKIP)
    .text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

  const title = isEdit ? 'Kurs rasmini yangilang' : 'Kurs uchun rasm yuklang'
  const descriptionText = isEdit 
    ? 'Yangi rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
    : 'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'

  // Eski xabarni o'chirish
  if (lastMessageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
    } catch (error) {
      // ignore
    }
  }

  const sentMsg = await ctx.reply(
    [
      `📸 *${title}*`,
      '',
      '✅ *Talablar (ixtiyoriy):*',
      '• Rasm kurs dizayni uchun ishlatiladi',
      '• JPG yoki PNG format',
      '• Rasm kurs haqida maʼlumot berishi mumkin',
      '',
      descriptionText
    ].join('\n'),
    { parse_mode: 'Markdown', reply_markup: kb }
  )
  lastMessageId = sentMsg.message_id

  while (true) {
    const u = await conversation.wait()

    if (u.callbackQuery) {
      const data = u.callbackQuery.data
      if (!data) continue

      await u.answerCallbackQuery().catch(() => {})

      if (data === CallbackData.NAV_CANCEL) throw navError('CANCEL')
      
      if (data === CallbackData.COURSE_PHOTO_SKIP) {
        if (lastMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
          } catch (error) {
            // ignore
          }
        }
        if (isEdit) {
          await ctx.reply('⏭ Kurs rasmi oʻzgartirilmadi')
        } else {
          await ctx.reply('⏭ Kurs rasmi yuklanmadi (ixtiyoriy)')
        }
        return null
      }

      if (data === CallbackData.COURSE_PHOTO_RULES) {
        if (lastMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
          } catch (error) {
            // ignore
          }
        }

        const rulesMsg = await ctx.reply(
          [
            '📋 *Rasm talablari:*',
            '',
            '✅ *Qabul qilinadi:*',
            '• JPG, PNG formatlari',
            '• Har qanday oʻlcham',
            '• Kursga mos rasm',
            '',
            '❌ *Qabul qilinmaydi:*',
            '• Video fayllar',
            '• Hajmi juda kichik',
            '',
            descriptionText
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: kb }
        )
        lastMessageId = rulesMsg.message_id
        continue
      }
    }

    if (u.message?.photo?.length) {
      // Agar rasm yuklanayotgan bo'lsa, takroriy so'rovlarni bloklash
      if (isProcessing) {
        await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
        continue
      }

      isProcessing = true
      const best = u.message.photo[u.message.photo.length - 1]

      // "Yuklanmoqda" xabarini yuborish
      const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
      loadingMessageId = loadingMsg.message_id

      try {
        // Rasmni validatsiya qilish (tezroq bo'lishi uchun minimal tekshirish)
        const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
          minWidth: 50,  // Minimal talablarni kamaytirish
          minHeight: 50,
          minRatio: 0.1,
          maxRatio: 10
        })

        if (!validated.ok) {
          if (loadingMessageId) {
            try {
              await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
            } catch (error) {
              // ignore
            }
          }

          await ctx.reply(`❌ *Xatolik:*\n${validated.reason}`, {
            parse_mode: 'Markdown'
          })
          isProcessing = false
          continue
        }

        // Cloudinary ga yuklash (timeout bilan)
        try {
          const uploaded = await Promise.race([
            photoService.uploadBufferToCloudinary(validated.buffer),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Upload timeout')), 30000) // 30 sekund
            )
          ]) as { secureUrl: string }

          if (loadingMessageId) {
            try {
              await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
            } catch (error) {
              // ignore
            }
          }

          console.log(`✅ Kurs rasmi yuklandi: ${uploaded.secureUrl}`)

          // ========== MUHIM: Rasmni DATABASE'ga saqlash ==========
          await conversation.external(() =>
            prisma.course.update({
              where: { id: courseId },
              data: { imageUrl: uploaded.secureUrl }
            })
          )
          console.log(`✅ Kurs rasmi database'ga saqlandi: ${courseId}`)
          // ======================================================

          // Eski xabarni o'chirish
          if (lastMessageId) {
            try {
              await ctx.api.deleteMessage(ctx.chat!.id, lastMessageId)
            } catch (error) {
              // ignore
            }
          }

          await ctx.reply(isEdit ? '✅ Kurs rasmi yangilandi!' : '✅ Kurs rasmi muvaffaqiyatli yuklandi!')
          return uploaded.secureUrl

        } catch (uploadError) {
          logger.error({ error: uploadError }, 'Failed to upload course photo')
          
          if (loadingMessageId) {
            try {
              await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
            } catch (error) {
              // ignore
            }
          }
          
          await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
          isProcessing = false
          continue
        }

      } catch (error) {
        logger.error({ error }, 'Error validating photo')
        
        if (loadingMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
          } catch (error) {
            // ignore
          }
        }
        
        await ctx.reply('❌ Rasmni tekshirishda xatolik. Qayta urinib koʻring.')
        isProcessing = false
        continue
      }
    }

    // Matn xabar - FAQAT rasm kutilayotganda
    if (u.message?.text && !isProcessing) {
      const text = u.message.text.trim().toLowerCase()
      
      // Skip buyruqlarini tekshirish
      if (text === '/start') throw navError('START')
      if (text === '/admin') throw navError('ADMIN')
      if (text === '/cancel') throw navError('CANCEL')

      await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.')
    }
  }
}
/**
 * Kurs rasmini o'chirish
 */
async function deleteCoursePhoto(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string
): Promise<boolean> {
  const confirm = await askChoice(
    conversation,
    ctx,
    '⚠️ *Rostdan ham kurs rasmini oʻchirmoqchimisiz?*',
    [
      { text: '✅ Ha', data: 'YES' },
      { text: '❌ Yoʻq', data: 'NO' }
    ]
  )

  if (confirm === 'YES') {
    await conversation.external(() =>
      prisma.course.update({
        where: { id: courseId },
        data: { imageUrl: null }
      })
    )
    await ctx.reply('✅ Kurs rasmi oʻchirildi!')
    return true
  }
  return false
}
async function uploadVacancyPhoto(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string,
	isEdit: boolean = false
): Promise<string | null> {
	console.log(`🔍 uploadVacancyPhoto boshlandi: vacancyId=${vacancyId}, isEdit=${isEdit}`)

	let loadingMessageId: number | null = null
	let isProcessing = false
	let photoUploaded = false
	let result: string | null = null

	const kb = new InlineKeyboard()
		.text("📋 Qoidani ko'rsat", CallbackData.VAC_PHOTO_RULES)
		.row()
		.text('⏭ Oʻtkazib yuborish', CallbackData.VAC_PHOTO_SKIP)
		.text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

	const title = isEdit ? 'Vakansiya rasmini yangilang' : 'Vakansiya uchun rasm yuklang'
	const descriptionText = isEdit
		? 'Yangi rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
		: 'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'

	const buildMainText = () =>
		[
			`📸 *${title}*`,
			'',
			'✅ *Talablar (ixtiyoriy):*',
			'• Rasm vakansiya dizayni uchun ishlatiladi',
			'• JPG yoki PNG format',
			'• Rasm arizada savol sifatida chiqmaydi',
			'',
			descriptionText
		].join('\n')

	const buildRulesText = () =>
		[
			'📋 *Rasm talablari:*',
			'',
			'✅ *Qabul qilinadi:*',
			'• JPG, PNG formatlari',
			'• 100x100 pikseldan katta',
			'',
			'❌ *Qabul qilinmaydi:*',
			'• Video fayllar',
			'• Hajmi juda kichik',
			'',
			descriptionText
		].join('\n')

	const sentMsg = await ctx.reply(buildMainText(), {
		parse_mode: 'Markdown',
		reply_markup: kb
	})
	ctx.session.lastBotMessageId = sentMsg.message_id

	while (!photoUploaded) {
		console.log('⏳ Rasm kutilyapti...')
		const upd = await conversation.wait()

		// ================= CALLBACK =================
		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			await upd.answerCallbackQuery().catch(() => {})
			if (!data) continue

			if (data === CallbackData.NAV_CANCEL) throw navError('CANCEL')

			if (data === CallbackData.VAC_PHOTO_SKIP) {
				await deletePrevBotMessage(ctx)
				await ctx.reply(isEdit ? '⏭ Rasm oʻzgartirilmadi' : '⏭ Rasm yuklanmadi')
				return null
			}

			if (data === CallbackData.VAC_PHOTO_RULES) {
				try {
					await ctx.api.editMessageText(
						ctx.chat!.id,
						ctx.session.lastBotMessageId ?? sentMsg.message_id,
						buildRulesText(),
						{ parse_mode: 'Markdown', reply_markup: kb }
					)
				} catch {
					const rulesMsg = await ctx.reply(buildRulesText(), {
						parse_mode: 'Markdown',
						reply_markup: kb
					})
					ctx.session.lastBotMessageId = rulesMsg.message_id
				}
				continue
			}

			// Boshqa (eskirgan) callbacklar
			console.log('⚠️ Boshqa turdagi callback olindi:', data)
			continue
		}

		// ================= PHOTO =================
		if (upd.message?.photo?.length) {
			if (isProcessing) {
				await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
				continue
			}

			isProcessing = true
			const best = upd.message.photo[upd.message.photo.length - 1]

			const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
			loadingMessageId = loadingMsg.message_id

			try {
				const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
					minWidth: 50,
					minHeight: 50,
					minRatio: 0.1,
					maxRatio: 10
				})

				if (!validated.ok) {
					try {
						await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId!)
					} catch {}
					await ctx.reply(`❌ *Xatolik:*\n${validated.reason}`, { parse_mode: 'Markdown' })
					isProcessing = false
					continue
				}

				const uploaded = await Promise.race([
					photoService.uploadBufferToCloudinary(validated.buffer),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('Upload timeout')), 30000)
					)
				])

				try {
					await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId!)
				} catch {}

				// Database ga saqlash
				await prisma.vacancy.update({
					where: { id: vacancyId },
					data: { imageUrl: uploaded.secureUrl }
				})

				await deletePrevBotMessage(ctx)
				await ctx.reply(isEdit ? '✅ Vakansiya rasmi yangilandi!' : '✅ Vakansiya rasmi yuklandi!')

				result = uploaded.secureUrl
				photoUploaded = true
			} catch (error) {
				logger.error({ error }, 'Failed to upload vacancy photo')
				try {
					await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId!)
				} catch {}
				await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
				isProcessing = false
			}
			continue
		}

		// ================= TEXT =================
		if (upd.message?.text && !isProcessing) {
			const text = upd.message.text.trim()
			if (text === '/start') throw navError('START')
			if (text === '/admin') throw navError('ADMIN')
			if (text === '/cancel') throw navError('CANCEL')
			await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.', { reply_markup: kb })
		}
	}

	return result
}

// addVacancyQuestion funksiyasining to'liq versiyasi
async function addVacancyQuestion(
	conversation: Conversation<BotContext>,
	ctx: BotContext,
	vacancyId: string
): Promise<void> {
	// Avval mavjud savollar sonini tekshirish
	const existingQuestions = await prisma.vacancyQuestion.count({
		where: { vacancyId }
	})

	if (existingQuestions >= 10) {
		await ctx.reply('❌ Maksimal 10 ta savol qoʻshish mumkin!')
		return
	}

	// Savol matni
	const question = await askText(conversation, ctx, '❓ *Savol matnini kiriting:*')
	if (!question) return

	// Savol turi
	const type = await askChoice(conversation, ctx, '🧩 *Savol turini tanlang:*', [
		{ text: '✍️ Oddiy matn', data: 'TEXT' },
		{ text: '🔘 Variantli (SELECT)', data: 'SELECT' }
	])
	if (!type) return

	let questionType: 'TEXT' | 'SINGLE_SELECT' = 'TEXT'
	let options: { text: string; value: string }[] = []

	if (type === 'SELECT') {
		questionType = 'SINGLE_SELECT'

		let addMore = true
		let optIndex = 0
		const maxOptions = 6

		await ctx.reply(
			'🔘 *Variantli savol tanlandi*\n\nVariantlarni qoʻshamiz. Maksimum 6 ta variant.'
		)

		while (addMore && optIndex < maxOptions) {
			const optText = await askText(
				conversation,
				ctx,
				`📋 *Variant ${optIndex + 1} nomini kiriting:*\n\n(Maksimum ${maxOptions} ta variant)`
			)
			if (!optText) return

			options.push({
				text: optText,
				value: `opt_${Date.now()}_${optIndex}`
			})
			optIndex++

			// Agar maksimum variantga yetgan bo'lsak, to'xtatamiz
			if (optIndex >= maxOptions) {
				await ctx.reply(`✅ Maksimum ${maxOptions} ta variant qoʻshildi.`)
				addMore = false
				break
			}

			// Yana variant qo'shishni so'rash
			const more = await askChoice(
				conversation,
				ctx,
				`Yana variant qoʻshasizmi? (${optIndex}/${maxOptions})`,
				[
					{ text: '➕ Ha', data: 'YES' },
					{ text: '✅ Yetarli', data: 'NO' }
				]
			)
			addMore = more !== null && more.trim() === 'YES'
		}

		// Agar variant qo'shilmagan bo'lsa, xatolik
		if (options.length === 0) {
			await ctx.reply('❌ Variantli savol uchun kamida 1 ta variant qoʻshish kerak!')
			return
		}
	}

	// Tartib raqami
	const orderStr = await askText(conversation, ctx, '🔢 *Tartib raqami (0 dan boshlanadi):*')
	const order = Number(orderStr?.replace(/\D+/g, '')) || 0

	// Savolni yaratish
	const created = await prisma.vacancyQuestion.create({
		data: {
			vacancyId,
			question,
			type: questionType,
			order
		}
	})

	// Variantlarni qo'shish
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
		await ctx.reply(
			`✅ Savol qoʻshildi! (ID: ${created.id.slice(0, 8)}), ${options.length} ta variant bilan`
		)
	} else {
		await ctx.reply(`✅ Savol qoʻshildi! (ID: ${created.id.slice(0, 8)})`)
	}
}

async function deleteVacancyPhoto(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  vacancyId: string
): Promise<boolean> {
  const confirm = await askChoice(
    conversation,
    ctx,
    '⚠️ *Rostdan ham vakansiya rasmini oʻchirmoqchimisiz?*',
    [
      { text: '✅ Ha', data: 'YES' },
      { text: '❌ Yoʻq', data: 'NO' }
    ]
  )

  if (confirm === 'YES') {
    await prisma.vacancy.update({
      where: { id: vacancyId },
      data: { imageUrl: null }
    })
    await ctx.reply('✅ Vakansiya rasmi oʻchirildi!')
    return true
  }
  return false
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

    // Takroriy nomlarni aniqlash
    const titleCounts = new Map<string, number>()
    items.forEach(v => {
      titleCounts.set(v.title, (titleCounts.get(v.title) || 0) + 1)
    })

    let text = `📋 *Vakansiyalar ro‘yxati* (sahifa ${page + 1}/${totalPages})\n\n`
    const kb = new InlineKeyboard()

    for (const v of items) {
      const salaryIcon = v.salary ? '💰' : '⚪️'
      const repeatIcon = titleCounts.get(v.title)! > 1 ? '🔄' : ''

      // text += `${v.isActive ? '✅' : '⛔️'} *${v.title}* ${repeatIcon}\n`
      // text += `   ${salaryIcon} ${v.salary || 'Maosh kiritilmagan'}\n`
      // text += `   🆔 ${v.id.slice(0, 8)}\n`
      // text += `   📅 ${new Date(v.createdAt).toLocaleDateString()}\n\n`

      kb.text(`${v.title}`, `VAC|VIEW|${v.id}`).row()
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

// async function viewVacancy(
//   conversation: Conversation<BotContext>,
//   ctx: BotContext,
//   vacancyId: string
// ): Promise<void> {
//   const vacancy = await prisma.vacancy.findUnique({
//     where: { id: vacancyId },
//     include: { questions: { include: { options: true } } }
//   })

//   if (!vacancy) return

//   const hasSalary = vacancy.salary !== null && vacancy.salary !== ''

//   const text = [
//     `📌 *${vacancy.title}*`,
//     hasSalary ? `💰 *Maosh:* ${vacancy.salary}` : `💰 *Maosh:* Kiritilmagan`,
//     `⚡️ *Holat:* ${vacancy.isActive ? 'Faol' : 'Faol emas'}`,
//     `❓ *Savollar:* ${vacancy.questions?.length || 0} ta`,
//     '',
//     '*Quyidagilardan birini tanlang:*'
//   ].join('\n')

//   const kb = new InlineKeyboard().text('✏️ Nomi', `VAC_EDIT|TITLE|${vacancy.id}`)

//   if (hasSalary) {
//     kb.text('💰 Maoshni tahrirlash', `VAC_EDIT|SALARY|${vacancy.id}`)
//   } else {
//     kb.text('💰 Maosh qoʻshish', `VAC_EDIT|ADD_SALARY|${vacancy.id}`)
//   }

//   kb.row()
//     .text('🔀 Faollik', `VAC_EDIT|TOGGLE|${vacancy.id}`)
//     .text('❓ Savollar', `VAC_QUESTIONS|${vacancy.id}`)
//     .row()
//     .text('📋 Arizalar', `VAC_APPLICATIONS|${vacancy.id}`)
//     .text('🗑 O‘chirish', `VAC_DELETE|${vacancy.id}`)
//     .row()
//     .text('⬅️ Orqaga', 'VAC_BACK')

//   await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

//   const upd = await conversation.wait()
//   const data = upd.callbackQuery?.data
//   if (!data) return
//   await upd.answerCallbackQuery().catch(() => {})

//   if (data === 'VAC_BACK') return

//   if (data.startsWith('VAC_EDIT|TITLE|')) {
//     const newTitle = await askText(conversation, ctx, `✏️ *Yangi nom* (hozirgi: ${vacancy.title}):`)
//     if (newTitle) {
//       await prisma.vacancy.update({ where: { id: vacancyId }, data: { title: newTitle } })
//       await ctx.reply('✅ Nomi yangilandi!')
//     }
//     await viewVacancy(conversation, ctx, vacancyId)
//     return
//   }

//   if (data.startsWith('VAC_EDIT|SALARY|') || data.startsWith('VAC_EDIT|ADD_SALARY|')) {
//     await editVacancySalary(conversation, ctx, vacancyId, data.startsWith('VAC_EDIT|SALARY|'))
//     await viewVacancy(conversation, ctx, vacancyId)
//     return
//   }

//   if (data.startsWith('VAC_EDIT|TOGGLE|')) {
//     await prisma.vacancy.update({
//       where: { id: vacancyId },
//       data: { isActive: !vacancy.isActive }
//     })
//     await ctx.reply(`✅ Vakansiya ${!vacancy.isActive ? 'faollashtirildi' : 'faolsizlashtirildi'}`)
//     await viewVacancy(conversation, ctx, vacancyId)
//     return
//   }

//   if (data.startsWith('VAC_QUESTIONS|')) {
//     await manageVacancyQuestions(conversation, ctx, vacancyId)
//     return
//   }

//   if (data.startsWith('VAC_APPLICATIONS|')) {
//     await viewVacancyApplications(conversation, ctx, vacancyId)
//     return
//   }

//   if (data.startsWith('VAC_DELETE|')) {
//     const confirm = await askChoice(conversation, ctx, '⚠️ *Rostdan ham o‘chirilsinmi?*', [
//       { text: '✅ Ha', data: 'YES' },
//       { text: '❌ Yo‘q', data: 'NO' }
//     ])
//     if (confirm === 'YES') {
//       await prisma.vacancy.delete({ where: { id: vacancyId } })
//       await ctx.reply('✅ Vakansiya o‘chirildi')
//     }
//     return
//   }
// }


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
	const hasImage = vacancy.imageUrl !== null && vacancy.imageUrl !== ''

	const text = [
		`📌 *${escapeMarkdown(vacancy.title)}*`,
		hasSalary ? `💰 *Maosh:* ${vacancy.salary}` : `💰 *Maosh:* Kiritilmagan`,
		hasImage ? '🖼 *Rasm:* Bor' : '🖼 *Rasm:* Yoʻq',
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

	// YANGI: Rasm tugmalari
	if (hasImage) {
		kb.text('🖼 Rasmni yangilash', `VAC_EDIT|PHOTO|${vacancy.id}`)
		kb.text('🗑 Rasmni oʻchirish', `VAC_EDIT|DELETE_PHOTO|${vacancy.id}`)
	} else {
		kb.text('🖼 Rasm qoʻshish', `VAC_EDIT|ADD_PHOTO|${vacancy.id}`)
	}
	kb.row()

	// kb.text('🔀 Faollik', `VAC_EDIT|TOGGLE|${vacancy.id}`)
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
		const newTitle = await askText(
			conversation,
			ctx,
			`✏️ *Yangi nom* (hozirgi: ${escapeMarkdown(vacancy.title)}):`
		)
		if (newTitle) {
			await prisma.vacancy.update({ where: { id: vacancyId }, data: { title: newTitle } })
			await ctx.reply('✅ Nomi yangilandi!')
		}
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	if (data.startsWith('VAC_EDIT|SALARY|') || data.startsWith('VAC_EDIT|ADD_SALARY|')) {
		await editVacancySalary(conversation, ctx, vacancyId, data.startsWith('VAC_EDIT|SALARY|'))
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	// YANGI: Rasmni yangilash
	if (data.startsWith('VAC_EDIT|PHOTO|') || data.startsWith('VAC_EDIT|ADD_PHOTO|')) {
		const isEdit = data.startsWith('VAC_EDIT|PHOTO|')
		await uploadVacancyPhoto(conversation, ctx, vacancyId, isEdit)
		await viewVacancy(conversation, ctx, vacancyId)
		return
	}

	// YANGI: Rasmni o‘chirish
	if (data.startsWith('VAC_EDIT|DELETE_PHOTO|')) {
		await deleteVacancyPhoto(conversation, ctx, vacancyId)
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

	if (data.startsWith('VAC_APPLICATIONS|')) {
		await viewVacancyApplications(conversation, ctx, vacancyId)
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
async function viewVacancyApplications(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  vacancyId: string
): Promise<void> {
  const applications = await prisma.application.findMany({
    where: { vacancyId, status: { in: ['SUBMITTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED'] } },
    include: { answers: true, user: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  if (applications.length === 0) {
    await ctx.reply('📭 Bu vakansiyaga arizalar yo‘q')
    return
  }

  const text = [
    `📋 *Arizalar (${applications.length} ta)*`,
    '',
    ...applications.map((app, idx) => {
      const name = app.answers.find(a => a.fieldKey === 'full_name')?.fieldValue || "Noma'lum"
      return `${idx + 1}. ${name} - ${new Date(app.createdAt).toLocaleDateString()}`
    })
  ].join('\n')

  await ctx.reply(text, { parse_mode: 'Markdown' })
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
    newSalary = salaryValue.replace(/_/g, ' ') + ' soʻm'
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
      include: { options: true } as any,
      orderBy: { order: 'asc' }
    })

    let text = '❓ *Vakansiya savollari*\n\n'
    const kb = new InlineKeyboard()

    if (questions.length === 0) {
      text += 'Hozircha savollar yo‘q.'
    } else {
      ;(questions as any[]).forEach((q: any, idx) => {
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

// ==================== COURSE MANAGEMENT ====================

// async function manageCourses(
//   conversation: Conversation<BotContext>,
//   ctx: BotContext
// ): Promise<void> {
//   const perPage = 5
//   let page = 0

//   while (true) {
//     const total = await prisma.course.count()
//     if (total === 0) {
//       await ctx.reply('📭 *Kurslar yoʻq*', { parse_mode: 'Markdown' })
//       return
//     }

//     const totalPages = Math.ceil(total / perPage)
//     page = Math.min(page, totalPages - 1)

//     const courses = await prisma.course.findMany({
//       skip: page * perPage,
//       take: perPage,
//       orderBy: { createdAt: 'desc' }
//     })

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

    const totalPages = Math.ceil(total / perPage)
    page = Math.min(page, totalPages - 1)

    const courses = await prisma.course.findMany({
      skip: page * perPage,
      take: perPage,
      orderBy: { createdAt: 'desc' }
    })

    let text = `📚 *Kurslar roʻyxati* (sahifa ${page + 1}/${totalPages})\n\n`
    const kb = new InlineKeyboard()

    courses.forEach(course => {
      text += '\n'
      kb.text(course.title, `COURSE|VIEW|${course.id}`).row()
    })

    if (page > 0) kb.text('⬅️ Oldingi', 'COURSE|PAGE|PREV')
    if (page < totalPages - 1) kb.text('➡️ Keyingi', 'COURSE|PAGE|NEXT')
    kb.row().text('🏠 Bosh menyu', 'NAV|BACK')

    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue

    const fromMessageId = upd.callbackQuery?.message?.message_id
    if (fromMessageId && fromMessageId !== promptMsg.message_id) {
      await upd.answerCallbackQuery({
        text: getUserLang(ctx) === 'ru' ? 'Эти кнопки устарели.' : 'Bu tugmalar eskirgan.',
        show_alert: false
      }).catch(() => {})
      continue
    }

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
  while (true) {
    const course = await conversation.external(() =>
      prisma.course.findUnique({
        where: { id: courseId },
        include: { questions: { include: { options: true } } }
      })
    )

    if (!course) {
      await ctx.reply('⚠️ Kurs topilmadi yoki oʻchirib yuborilgan.')
      return
    }

    const hasPrice = course.price !== null && course.price !== ''
    const hasImage = course.imageUrl !== null && course.imageUrl !== ''

    let priceText = 'Kiritilmagan'
    if (hasPrice && course.price) {
      if (course.price === 'Bepul') {
        priceText = course.price
      } else if (course.price.includes('soʻm') || course.price.includes("so'm")) {
        priceText = course.price
      } else {
        priceText = `${course.price} soʻm`
      }
    }

    const escapedDescription = course.description
      ? escapeMarkdown(course.description)
      : null

    const escapedTitle = escapeMarkdown(course.title)

    const text = [
      `🎓 *${escapedTitle}*`,
      '',
      escapedDescription
        ? `📝 *Tavsif:*\n${escapedDescription}`
        : '📝 *Tavsif:* Kiritilmagan',
      '',
      `💰 *Narxi:* ${priceText}`,
      hasImage ? '🖼 *Rasm:* Bor' : '🖼 *Rasm:* Yoʻq',
      `⚡️ *Holat:* ${course.isActive ? 'Faol' : 'Faol emas'}`,
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

    if (hasImage) {
      kb.text('🖼 Rasmni yangilash', `COURSE_EDIT|PHOTO|${course.id}`)
      kb.text('🗑 Rasmni oʻchirish', `COURSE_EDIT|DELETE_PHOTO|${course.id}`)
    } else {
      kb.text('🖼 Rasm qoʻshish', `COURSE_EDIT|ADD_PHOTO|${course.id}`)
    }
    kb.row()
      .text('🗑 Oʻchirish', `COURSE_DELETE|${course.id}`)
      .row()
      .text('⬅️ Orqaga', 'COURSE_BACK')

    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

    while (true) {
      const upd = await conversation.wait()
      const data = upd.callbackQuery?.data
      if (!data) continue

      const fromMessageId = upd.callbackQuery?.message?.message_id
      if (fromMessageId && fromMessageId !== promptMsg.message_id) {
        await upd.answerCallbackQuery({
          text: getUserLang(ctx) === 'ru' ? 'Эти кнопки устарели.' : 'Bu tugmalar eskirgan.',
          show_alert: false
        }).catch(() => {})
        continue
      }

      await upd.answerCallbackQuery().catch(() => {})

      if (data === 'COURSE_BACK') return

      if (data.startsWith('COURSE_EDIT|TITLE|')) {
        const newTitle = await askText(
          conversation,
          ctx,
          `✏️ *Yangi nom* (hozirgi: ${escapeMarkdown(course.title)}):`
        )
        if (newTitle) {
          await conversation.external(() =>
            prisma.course.update({ where: { id: courseId }, data: { title: newTitle } })
          )
          await ctx.reply('✅ Nomi yangilandi!')
        }
        break
      }

      if (data.startsWith('COURSE_EDIT|DESC|')) {
        const newDesc = await askText(
          conversation,
          ctx,
          `📝 *Yangi tavsif* (hozirgi: ${
            course.description ? escapeMarkdown(course.description) : 'kiritilmagan'
          }):\n\nTavsif kiritmasangiz, boʻsh qoldirish uchun ➖ belgisini yuboring.`
        )
        if (newDesc) {
          const description = newDesc === '➖' ? null : newDesc
          await conversation.external(() =>
            prisma.course.update({ where: { id: courseId }, data: { description } })
          )
          await ctx.reply(description ? '✅ Tavsif yangilandi!' : '✅ Tavsif oʻchirildi!')
        }
        break
      }

      if (data.startsWith('COURSE_EDIT|PRICE|') || data.startsWith('COURSE_EDIT|ADD_PRICE|')) {
        await editCoursePrice(conversation, ctx, courseId, data.startsWith('COURSE_EDIT|PRICE|'))
        break
      }

      if (data.startsWith('COURSE_EDIT|PHOTO|') || data.startsWith('COURSE_EDIT|ADD_PHOTO|')) {
        const isEdit = data.startsWith('COURSE_EDIT|PHOTO|')
        await uploadCoursePhoto(conversation, ctx, courseId, isEdit)
        break
      }

      if (data.startsWith('COURSE_EDIT|DELETE_PHOTO|')) {
        await deleteCoursePhoto(conversation, ctx, courseId)
        break
      }

      if (data.startsWith('COURSE_EDIT|TOGGLE|')) {
        await conversation.external(() =>
          prisma.course.update({
            where: { id: courseId },
            data: { isActive: !course.isActive }
          })
        )
        await ctx.reply(`✅ Kurs ${!course.isActive ? 'faollashtirildi' : 'faolsizlashtirildi'}`)
        break
      }

      if (data.startsWith('COURSE_DELETE|')) {
        const confirm = await askChoice(conversation, ctx, '⚠️ *Rostdan ham oʻchirilsinmi?*', [
          { text: '✅ Ha', data: 'YES' },
          { text: '❌ Yoʻq', data: 'NO' }
        ])
        if (confirm === 'YES') {
          await conversation.external(() =>
            prisma.course.delete({ where: { id: courseId } })
          )
          await ctx.reply('✅ Kurs oʻchirildi')
          return
        }
        break
      }
    }
  }
}
async function viewCourseEnrollments(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string
): Promise<void> {
  const enrollments = await prisma.courseEnrollment.findMany({
    where: { courseId },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  })

  if (enrollments.length === 0) {
    await ctx.reply('📭 Bu kursga yozilishlar yoʻq')
    return
  }

  const text = [
    `📋 *Kursga yozilishlar (${enrollments.length} ta)*`,
    '',
    ...enrollments.map((e, idx) => {
      return `${idx + 1}. ${e.user.username || "Noma'lum"} - ${e.status} - ${new Date(
				e.createdAt
			).toLocaleDateString()}`
    })
  ].join('\n')

  await ctx.reply(text, { parse_mode: 'Markdown' })
}

async function editCoursePrice(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string,
  isEditing: boolean
): Promise<void> {
  const course = await conversation.external(() =>
    prisma.course.findUnique({ where: { id: courseId } })
  )
  if (!course) return

  const currentPrice = isEditing ? `(hozirgi: ${course.price || 'kiritilmagan'})` : ''

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
      { text: 'Bepul', data: 'PRICE|FREE' },
      { text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
      { text: isEditing ? '❌ Oʻchirish' : '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
    ],
    { columns: 2 }
  )

  if (!priceChoice || !priceChoice.startsWith('PRICE|')) return

  const priceValue = priceChoice.replace('PRICE|', '')

  if (priceValue === 'SKIP') {
    if (isEditing) {
      await conversation.external(() =>
        prisma.course.update({ where: { id: courseId }, data: { price: null } })
      )
      await ctx.reply('✅ Narx oʻchirildi!')
    } else {
      await ctx.reply('⏭ Narx qoʻshilmadi.')
    }
    return
  }

  let newPrice: string | null = null

  if (priceValue === 'FREE') {
    newPrice = 'Bepul'
  } else if (priceValue === 'CUSTOM') {
    const customPrice = await askText(conversation, ctx, '💰 *Narxni kiriting:*')
    const cleanPrice = customPrice.replace(/[^0-9]/g, '')
    // MUHIM: "so'm" ni bir marta qo'shamiz
    newPrice = cleanPrice ? `${parseInt(cleanPrice).toLocaleString()} soʻm` : null
  } else {
    // MUHIM: "so'm" ni bir marta qo'shamiz
    newPrice = `${parseInt(priceValue).toLocaleString()} soʻm`
  }

  if (newPrice) {
    await conversation.external(() =>
      prisma.course.update({
        where: { id: courseId },
        data: { price: newPrice }
      })
    )
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
      ;(questions as any[]).forEach((q: any, idx) => {
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

// ==================== STATISTICS WITH EXPORT ====================

async function showStatistics(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
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
  ] = await Promise.all([
    prisma.user.count(),
    prisma.application.count(),
    prisma.application.count({ where: { status: 'SUBMITTED' } }),
    prisma.application.count({ where: { status: 'APPROVED' } }),
    prisma.application.count({ where: { status: 'REJECTED' } }),
    prisma.courseEnrollment.count(),
    prisma.courseEnrollment.count({ where: { status: 'APPROVED' } }),
    prisma.course.findMany({
      include: { _count: { select: { enrollments: true } } },
      orderBy: { enrollments: { _count: 'desc' } },
      take: 5
    }),
    prisma.vacancy.findMany({
      include: { _count: { select: { applications: true } } },
      orderBy: { applications: { _count: 'desc' } },
      take: 5
    })
  ])

  const isRu = getUserLang(ctx) === 'ru'

  let statsText = [
    isRu ? '📊 *Общая статистика*' : '📊 *Umumiy statistika*',
    '',
    isRu ? `👥 Пользователи: *${userCount}*` : `👥 Foydalanuvchilar: *${userCount}*`,
    isRu ? `👨‍💼 Админы: *${[process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2].filter(Boolean).length}*` : `👨‍💼 Adminlar: *${[process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2].filter(Boolean).length}*`,
    isRu ? `📨 Всего заявок: *${applicationCount}*` : `📨 Jami arizalar: *${applicationCount}*`,
    isRu ? `🆕 Новые/отправленные заявки: *${submittedCount}*` : `🆕 Yangi/submitted arizalar: *${submittedCount}*`,
    isRu ? `✅ Принятые заявки: *${approvedCount}*` : `✅ Qabul qilingan arizalar: *${approvedCount}*`,
    isRu ? `❌ Отклонённые заявки: *${rejectedCount}*` : `❌ Rad etilgan arizalar: *${rejectedCount}*`,
    '',
    isRu ? `🎓 Всего записей на курсы: *${courseCount}*` : `🎓 Jami kurs yozilishlar: *${courseCount}*`,
    isRu ? `✅ Принятые записи на курсы: *${courseApproved}*` : `✅ Qabul qilingan kurs yozilishlar: *${courseApproved}*`,
    ''
  ].join('\n')

  if (topCourses.length) {
    statsText += isRu ? '\n*🏆 Топ курсы:*\n' : '\n*🏆 Top kurslar:*\n'
    topCourses.forEach((course, idx) => {
      statsText += isRu ? `\n${idx + 1}. ${course.title} — ${course._count.enrollments} шт.` : `\n${idx + 1}. ${course.title} — ${course._count.enrollments} ta`
    })
    statsText += '\n'
  }

  if (topVacancies.length) {
    statsText += isRu ? '\n*🏆 Топ вакансии:*\n' : '\n*🏆 Top vakansiyalar:*\n'
    topVacancies.forEach((vacancy, idx) => {
      statsText += isRu ? `\n${idx + 1}. ${vacancy.title} — ${vacancy._count.applications} шт.` : `\n${idx + 1}. ${vacancy.title} — ${vacancy._count.applications} ta`
    })
  }

  const action = await askChoice(
    conversation,
    ctx,
    statsText,
    [{ text: isRu ? '📥 Скачать Excel' : '📥 Excel yuklab olish', data: 'STATS|EXPORT' }],
    { cancel: true }
  )

  if (action === 'STATS|EXPORT') {
    await exportStatistics(conversation, ctx)
  }
}

async function exportStatistics(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  await ctx.reply(adminText(ctx, '⏳ Statistika tayyorlanmoqda...', '⏳ Подготавливается статистика...'))

  try {
    // Ma'lumotlarni olish
    const applications = await prisma.application.findMany({
      include: {
        answers: true,
        files: true,
        vacancy: true,
        user: true
      },
      orderBy: { createdAt: 'desc' }
    })

    const courses = await prisma.courseEnrollment.findMany({
      include: {
        course: true,
        user: true
      },
      orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { telegramId: true, firstName: true, lastName: true, createdAt: true, username: true }
    })

    const buffer = await exportToExcel(
      applications,
      courses,
      users.map(u => ({
        telegramId: u.telegramId,
        fullName: [u.firstName, u.lastName].filter(Boolean).join(' '),
        phone: u.username ? '@' + u.username : null,
        language: null,
        createdAt: u.createdAt
      }))
    )

    await ctx.replyWithDocument(new InputFile(Buffer.from(buffer), 'statistika.xlsx'), {
      caption: adminText(ctx, '📊 Statistika Excel formatida', '📊 Статистика в формате Excel')
    })
  } catch (error) {
    logger.error({ error }, 'Excel export failed')
    await ctx.reply(adminText(ctx, '❌ Statistika yuklab olishda xatolik yuz berdi.', '❌ Не удалось выгрузить статистику.'))
  }
}

// ==================== MAIN ADMIN FLOW ====================

// export async function adminFlow(
//   conversation: Conversation<BotContext>,
//   ctx: BotContext
// ): Promise<void> {
//   if (!isAdmin(ctx)) {
//     await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
//     return
//   }

//   try {
//     while (true) {
// 			const action = await askChoice(conversation, ctx, '*👨‍💼 Admin panel*', [
// 				{ text: '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
// 				{ text: '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
// 				{ text: '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
// 				{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' },
// 				{ text: '📨 Arizalar', data: 'A|APP_LIST' },
// 				{ text: '📊 Statistika', data: 'A|STATS' }
// 			])

// 			if (!action) continue

// 			if (action === 'A|STATS') {
// 				await showStatistics(conversation, ctx)
// 				continue
// 			}

// 			if (action === 'A|VAC_LIST') {
// 				await manageVacancies(conversation, ctx)
// 				continue
// 			}

// 			if (action === 'A|COURSE_LIST') {
// 				await manageCourses(conversation, ctx)
// 				continue
// 			}

// 			if (action === 'A|APP_LIST') {
// 				await ctx.reply('📨 Arizalar boʻlimi ishga tushirilmoqda...')
// 				continue
// 			}

// 			// ==================== VACANCY ADD WITH PHOTO AND CLEANUP ====================
// 			// if (action === 'A|VAC_ADD') {
// 			// 	// Step 1: Vakansiya nomi
// 			// 	const title = await askText(conversation, ctx, '📌 *Step 1: Vakansiya nomini kiriting*')
// 			// 	if (!title) continue

// 			// 	// MAVJUD VAKANSIYANI TEKSHIRISH
// 			// 	const existingVacancy = await prisma.vacancy.findFirst({
// 			// 		where: {
// 			// 			title: {
// 			// 				equals: title,
// 			// 				mode: 'insensitive'
// 			// 			}
// 			// 		}
// 			// 	})

// 			// 	if (existingVacancy) {
// 			// 		const confirm = await askChoice(
// 			// 			conversation,
// 			// 			ctx,
// 			// 			`⚠️ *${title}* nomli vakansiya allaqachon mavjud!\n\nDavom etilsa, takroriy vakansiya yaratiladi.\n\nDavom etasizmi?`,
// 			// 			[
// 			// 				{ text: '✅ Ha, davom et', data: 'CONTINUE' },
// 			// 				{ text: '❌ Yoʻq, bekor qil', data: 'CANCEL' }
// 			// 			]
// 			// 		)

// 			// 		if (confirm !== 'CONTINUE') {
// 			// 			await ctx.reply('❌ Vakansiya qoʻshish bekor qilindi.')
// 			// 			continue
// 			// 		}
// 			// 	}

// 			// 	// Step 2: Maosh so'rash - OPTIONAL
// 			// 	const salaryChoice = await askChoice(
// 			// 		conversation,
// 			// 		ctx,
// 			// 		'💰 *Step 2: Maoshni tanlang yoki oʻtkazib yuboring*',
// 			// 		[
// 			// 			{ text: '1 000 000 soʻm', data: 'SALARY|1_000_000' },
// 			// 			{ text: '2 000 000 soʻm', data: 'SALARY|2_000_000' },
// 			// 			{ text: '4 000 000 soʻm', data: 'SALARY|4_000_000' },
// 			// 			{ text: 'Kelishiladi', data: 'SALARY|negotiable' },
// 			// 			{ text: '⏭ Oʻtkazib yuborish', data: 'SALARY|SKIP' }
// 			// 		],
// 			// 		{ columns: 2 }
// 			// 	)

// 			// 	console.log('Salary choice raw:', salaryChoice)

// 			// 	let salary: string | null = null

// 			// 	if (salaryChoice) {
// 			// 		const trimmedChoice = salaryChoice.trim()
// 			// 		if (trimmedChoice.startsWith('SALARY|')) {
// 			// 			const salaryValue = trimmedChoice.replace('SALARY|', '')
// 			// 			if (salaryValue === 'SKIP') {
// 			// 				salary = null
// 			// 			} else if (salaryValue === 'negotiable') {
// 			// 				salary = 'Kelishiladi'
// 			// 			} else {
// 			// 				salary = salaryValue.replace(/_/g, ' ') + ' soʻm'
// 			// 			}
// 			// 		}
// 			// 	}

// 			// 	// Vakansiyani yaratish
// 			// 	const vacancy = await prisma.vacancy.create({
// 			// 		data: {
// 			// 			title,
// 			// 			salary: salary,
// 			// 			isActive: true
// 			// 		}
// 			// 	})

// 			// 	await ctx.reply(
// 			// 		salary
// 			// 			? `✅ Vakansiya yaratildi! (Maosh: ${salary})`
// 			// 			: `✅ Vakansiya yaratildi! Maosh kiritilmadi`
// 			// 	)

// 			// 	// ========== MUHIM: ESKI CALLBACKLARNI TOZALASH ==========
// 			// 	console.log('🧹 Eski callbacklarni tozalash...')

// 			// 	// Eski callbacklarni yig'ishtirish
// 			// 	let cleanedCount = 0
// 			// 	const maxCleanup = 5

// 			// 	while (cleanedCount < maxCleanup) {
// 			// 		try {
// 			// 			// 200ms kutish bilan eski callbacklarni yig'ish
// 			// 			const oldUpd = await Promise.race([
// 			// 				conversation.wait(),
// 			// 				new Promise(resolve => setTimeout(resolve, 200))
// 			// 			])

// 			// 			if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
// 			// 				await oldUpd.answerCallbackQuery().catch(() => {})
// 			// 				console.log(
// 			// 					`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
// 			// 					oldUpd.callbackQuery.data
// 			// 				)
// 			// 				cleanedCount++
// 			// 			} else {
// 			// 				// Agar callback kelmasa, tozalashni to'xtat
// 			// 				break
// 			// 			}
// 			// 		} catch (e) {
// 			// 			// Timeout yoki xatolik bo'lsa, tozalashni to'xtat
// 			// 			console.log('Eski callbacklar yoʻq yoki vaqt tugadi')
// 			// 			break
// 			// 		}
// 			// 	}

// 			// 	console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
// 			// 	await conversation.sleep(500)
// 			// 	// ========== TOZALASH TUGADI ==========

// 			// 	// ========== RASM YUKLASH (SAVOLLARDAN OLDIN) ==========
// 			// 	console.log('📸 Vakansiya rasmi soʻralmoqda...')
// 			// 	const photoUrl = await uploadVacancyPhoto(conversation, ctx, vacancy.id)
// 			// 	if (photoUrl) {
// 			// 		console.log('✅ Rasm yuklandi:', photoUrl)
// 			// 	}
// 			// 	// ========== RASM YUKLASH TUGADI ==========

// 			// 	// Savol qo'shishni so'rash
// 			// 	const addQuestion = await askChoice(conversation, ctx, '❓ *Savol qoʻshasizmi?*', [
// 			// 		{ text: '✅ Ha', data: 'YES' },
// 			// 		{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
// 			// 	])

// 			// 	console.log('Savol qoʻshish natijasi:', addQuestion)

// 			// 	if (addQuestion && addQuestion.trim() === 'YES') {
// 			// 		await ctx.reply('Endi savollar qoʻshamiz.')

// 			// 		let addMore = true
// 			// 		while (addMore) {
// 			// 			await addVacancyQuestion(conversation, ctx, vacancy.id)

// 			// 			await conversation.sleep(500) // Har bir savoldan keyin kutish

// 			// 			const more = await askChoice(conversation, ctx, 'Yana savol qoʻshasizmi?', [
// 			// 				{ text: '➕ Yana savol', data: 'YES' },
// 			// 				{ text: '✅ Yetarli', data: 'NO' }
// 			// 			])

// 			// 			// MUHIM: TypeScript xatosini tuzatish
// 			// 			addMore = more !== null && more.trim() === 'YES'
// 			// 		}

// 			// 		await ctx.reply('✅ Vakansiya va savollar muvaffaqiyatli qoʻshildi!')
// 			// 	} else if (addQuestion && addQuestion.trim() === 'NO') {
// 			// 		await ctx.reply('✅ Vakansiya muvaffaqiyatli qoʻshildi! (Savollar qoʻshilmadi)')
// 			// 	} else {
// 			// 		await ctx.reply('⚠️ Savol qoʻshish bekor qilindi.')
// 			// 	}
// 			// 	continue
// 			// }

// 			// admin.flow.ts dagi A|VAC_ADD qismida

// 			if (action === 'A|VAC_ADD') {
// 				// Step 1: Vakansiya nomi
// 				const title = await askText(conversation, ctx, '📌 *Step 1: Vakansiya nomini kiriting*')
// 				if (!title) continue

// 				// ========== YANGI: Description qo'shish ==========
// 				const wantDescription = await askChoice(
// 					conversation,
// 					ctx,
// 					'📝 *Vakansiya tavsifi qoʻshasizmi?*',
// 					[
// 						{ text: '✅ Ha', data: 'YES' },
// 						{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
// 					]
// 				)

// 				let description: string | null = null
// 				if (wantDescription === 'YES') {
// 					description = await askText(
// 						conversation,
// 						ctx,
// 						'📝 *Vakansiya tavsifini kiriting:*\n\n(Vakansiya haqida qoʻshimcha maʼlumot)'
// 					)
// 				}
// 				// ================================================

// 				// MAVJUD VAKANSIYANI TEKSHIRISH
// 				const existingVacancy = await prisma.vacancy.findFirst({
// 					where: {
// 						title: {
// 							equals: title,
// 							mode: 'insensitive'
// 						}
// 					}
// 				})

// 				if (existingVacancy) {
// 					const confirm = await askChoice(
// 						conversation,
// 						ctx,
// 						`⚠️ *${title}* nomli vakansiya allaqachon mavjud!\n\nDavom etilsa, takroriy vakansiya yaratiladi.\n\nDavom etasizmi?`,
// 						[
// 							{ text: '✅ Ha, davom et', data: 'CONTINUE' },
// 							{ text: '❌ Yoʻq, bekor qil', data: 'CANCEL' }
// 						]
// 					)

// 					if (confirm !== 'CONTINUE') {
// 						await ctx.reply('❌ Vakansiya qoʻshish bekor qilindi.')
// 						continue
// 					}
// 				}

// 				// Step 2: Maosh so'rash - OPTIONAL
// 				const salaryChoice = await askChoice(
// 					conversation,
// 					ctx,
// 					'💰 *Step 2: Maoshni tanlang yoki oʻtkazib yuboring*',
// 					[
// 						{ text: '1 000 000 soʻm', data: 'SALARY|1_000_000' },
// 						{ text: '2 000 000 soʻm', data: 'SALARY|2_000_000' },
// 						{ text: '4 000 000 soʻm', data: 'SALARY|4_000_000' },
// 						{ text: 'Kelishiladi', data: 'SALARY|negotiable' },
// 						{ text: '⏭ Oʻtkazib yuborish', data: 'SALARY|SKIP' }
// 					],
// 					{ columns: 2 }
// 				)

// 				console.log('Salary choice raw:', salaryChoice)

// 				let salary: string | null = null

// 				if (salaryChoice) {
// 					const trimmedChoice = salaryChoice.trim()
// 					if (trimmedChoice.startsWith('SALARY|')) {
// 						const salaryValue = trimmedChoice.replace('SALARY|', '')
// 						if (salaryValue === 'SKIP') {
// 							salary = null
// 						} else if (salaryValue === 'negotiable') {
// 							salary = 'Kelishiladi'
// 						} else {
// 							salary = salaryValue.replace(/_/g, ' ') + ' soʻm'
// 						}
// 					}
// 				}

// 				// Vakansiyani yaratish
// 				const vacancy = await prisma.vacancy.create({
// 					data: {
// 						title,
// 						description,
// 						salary: salary,
// 						isActive: true
// 					}
// 				})

// 				await ctx.reply(
// 					salary
// 						? `✅ Vakansiya yaratildi! (Maosh: ${salary})`
// 						: `✅ Vakansiya yaratildi! Maosh kiritilmadi`
// 				)

// 				// ========== MUHIM: ESKI CALLBACKLARNI TOZALASH ==========
// 				console.log('🧹 Eski callbacklarni tozalash...')
// 				let cleanedCount = 0
// 				const maxCleanup = 5

// 				while (cleanedCount < maxCleanup) {
// 					try {
// 						const oldUpd = await Promise.race([
// 							conversation.wait(),
// 							new Promise(resolve => setTimeout(resolve, 200))
// 						])

// 						if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
// 							await oldUpd.answerCallbackQuery().catch(() => {})
// 							console.log(
// 								`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
// 								oldUpd.callbackQuery.data
// 							)
// 							cleanedCount++
// 						} else {
// 							break
// 						}
// 					} catch (e) {
// 						console.log('Eski callbacklar yoʻq yoki vaqt tugadi')
// 						break
// 					}
// 				}
// 				console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
// 				await conversation.sleep(500)

// 				// ========== RASM YUKLASH (SAVOLLARDAN OLDIN) ==========
// 				console.log('📸 Vakansiya rasmi soʻralmoqda...')
// 				const photoUrl = await uploadVacancyPhoto(conversation, ctx, vacancy.id, false)

// 				if (photoUrl) {
// 					console.log('✅ Vakansiya rasmi yuklandi va saqlandi:', photoUrl)
// 				} else {
// 					console.log('⏭ Vakansiya rasmi yuklanmadi (ixtiyoriy)')
// 				}

// 				// ========== YANA ESKI CALLBACKLARNI TOZALASH ==========
// 				console.log('🧹 uploadVacancyPhoto dan keyin eski callbacklarni tozalash...')
// 				cleanedCount = 0
// 				while (cleanedCount < maxCleanup) {
// 					try {
// 						const oldUpd = await Promise.race([
// 							conversation.wait(),
// 							new Promise(resolve => setTimeout(resolve, 200))
// 						])

// 						if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
// 							await oldUpd.answerCallbackQuery().catch(() => {})
// 							console.log(
// 								`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
// 								oldUpd.callbackQuery.data
// 							)
// 							cleanedCount++
// 						} else {
// 							break
// 						}
// 					} catch (e) {
// 						break
// 					}
// 				}
// 				console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
// 				await conversation.sleep(300)

// 				// Savol qo'shishni so'rash
// 				const addQuestion = await askChoice(conversation, ctx, '❓ *Savol qoʻshasizmi?*', [
// 					{ text: '✅ Ha', data: 'YES' },
// 					{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
// 				])

// 				console.log('Savol qoʻshish natijasi:', addQuestion)

// 				if (addQuestion && addQuestion.trim() === 'YES') {
// 					await ctx.reply('Endi savollar qoʻshamiz.')

// 					let addMore = true
// 					while (addMore) {
// 						await addVacancyQuestion(conversation, ctx, vacancy.id)
// 						await conversation.sleep(500)

// 						const more = await askChoice(conversation, ctx, 'Yana savol qoʻshasizmi?', [
// 							{ text: '➕ Yana savol', data: 'YES' },
// 							{ text: '✅ Yetarli', data: 'NO' }
// 						])

// 						addMore = more !== null && more.trim() === 'YES'
// 					}

// 					await ctx.reply('✅ Vakansiya va savollar muvaffaqiyatli qoʻshildi!')
// 				} else if (addQuestion && addQuestion.trim() === 'NO') {
// 					await ctx.reply('✅ Vakansiya muvaffaqiyatli qoʻshildi! (Savollar qoʻshilmadi)')
// 				} else {
// 					await ctx.reply('⚠️ Savol qoʻshish bekor qilindi.')
// 				}
// 				continue
// 			}

// 			if (action === 'A|COURSE_ADD') {
// 				// Step 1: Kurs nomi
// 				const title = await askText(conversation, ctx, '🎓 *Step 1: Kurs nomini kiriting:*')
// 				if (!title) continue

// 				// Step 2: Kurs tavsifi (OPTIONAL)
// 				const description = await askText(
// 					conversation,
// 					ctx,
// 					'📝 *Step 2: Kurs tavsifini kiriting:*\n\nAgar tavsif kiritmasangiz, ➖ belgisini yuboring.'
// 				)

// 				// Step 3: Kurs narxi (OPTIONAL)
// 				const priceChoice = await askChoice(
// 					conversation,
// 					ctx,
// 					'💰 *Step 3: Kurs narxini tanlang yoki oʻtkazib yuboring*',
// 					[
// 						{ text: '500 000 soʻm', data: 'PRICE|500000' },
// 						{ text: '1 000 000 soʻm', data: 'PRICE|1000000' },
// 						{ text: '1 500 000 soʻm', data: 'PRICE|1500000' },
// 						{ text: '2 000 000 soʻm', data: 'PRICE|2000000' },
// 						{ text: 'Bepul', data: 'PRICE|FREE' },
// 						{ text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
// 						{ text: '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
// 					],
// 					{ columns: 2 }
// 				)

// 				let price: string | null = null

// 				if (priceChoice && priceChoice.startsWith('PRICE|')) {
// 					const priceValue = priceChoice.replace('PRICE|', '')

// 					if (priceValue === 'SKIP') {
// 						price = null
// 					} else if (priceValue === 'FREE') {
// 						price = 'Bepul'
// 					} else if (priceValue === 'CUSTOM') {
// 						const customPrice = await askText(
// 							conversation,
// 							ctx,
// 							'💰 *Narxni kiriting:*\n\nMasalan: 750000 yoki 1.2 mln'
// 						)
// 						const cleanPrice = customPrice.replace(/[^0-9]/g, '')
// 						price = cleanPrice ? `${parseInt(cleanPrice).toLocaleString()} soʻm` : null
// 					} else {
// 						price = `${parseInt(priceValue).toLocaleString()} soʻm`
// 					}
// 				}

// 				// Kursni yaratish
// 				const course = await prisma.course.create({
// 					data: {
// 						title,
// 						description: description === '➖' ? null : description,
// 						price,
// 						isActive: true
// 					}
// 				})

// 				await ctx.reply(
// 					price
// 						? `✅ Kurs muvaffaqiyatli qoʻshildi! (Narx: ${price})`
// 						: '✅ Kurs muvaffaqiyatli qoʻshildi! (Narx kiritilmadi)'
// 				)

// 				// ========== MUHIM: ESKI CALLBACKLARNI TOZALASH ==========
// 				console.log('🧹 Kurs uchun eski callbacklarni tozalash...')

// 				let cleanedCount = 0
// 				const maxCleanup = 5

// 				while (cleanedCount < maxCleanup) {
// 					try {
// 						const oldUpd = await Promise.race([
// 							conversation.wait(),
// 							new Promise(resolve => setTimeout(resolve, 200))
// 						])

// 						if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
// 							await oldUpd.answerCallbackQuery().catch(() => {})
// 							console.log(
// 								`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
// 								oldUpd.callbackQuery.data
// 							)
// 							cleanedCount++
// 						} else {
// 							break
// 						}
// 					} catch (e) {
// 						console.log('Eski callbacklar yoʻq yoki vaqt tugadi')
// 						break
// 					}
// 				}

// 				console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
// 				await conversation.sleep(500)
// 				// ========== TOZALASH TUGADI ==========

// 				// ========== KURS RASMI YUKLASH (ixtiyoriy) ==========
// 				console.log('📸 Kurs rasmi soʻralmoqda...')
// 				const photoUrl = await uploadCoursePhoto(conversation, ctx, course.id, false)
// 				if (photoUrl) {
// 					console.log('✅ Kurs rasmi yuklandi:', photoUrl)
// 				}
// 				// ========== KURS RASMI YUKLASH TUGADI ==========

// 				continue
// 			}
// 		}
//   } catch (err) {
//     if (isNavSignal(err)) {
//       if (err.message === 'START') {
//         await showStartMenu(ctx)
//         return
//       }
//       if (err.message === 'ADMIN') {
//         await replaceBotMessage(ctx, '👨‍💼 Siz allaqachon admin panelsiz.')
//         return
//       }
//     }

//     logger.error({ err }, 'Admin flow failed')
//     await replaceBotMessage(ctx, '❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
//   }
// }

export async function adminFlow(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	if (!isAdmin(ctx)) {
		await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
		return
	}

	ctx.session.flowActive = true
	ctx.session.flowState = { step: 'idle' }

	try {
		while (true) {
			const state = ctx.session.flowState

			switch (state.step) {
				case 'idle':
					await showAdminMainMenu(conversation, ctx)
					break

				case 'vacancy_title':
					await handleVacancyTitle(conversation, ctx)
					break

				case 'vacancy_description_decision':
					await handleVacancyDescriptionDecision(conversation, ctx)
					break

				case 'vacancy_description_input':
					await handleVacancyDescriptionInput(conversation, ctx)
					break

				case 'vacancy_duplicate_check':
					await handleVacancyDuplicateCheck(conversation, ctx)
					break

				case 'vacancy_salary':
					await handleVacancySalary(conversation, ctx)
					break

				case 'vacancy_photo':
					await handleVacancyPhoto(conversation, ctx)
					break

				case 'vacancy_question_decision':
					await handleVacancyQuestionDecision(conversation, ctx)
					break

				case 'vacancy_question_add':
					await handleVacancyQuestionAdd(conversation, ctx)
					break

				case 'vacancy_question_more':
					await handleVacancyQuestionMore(conversation, ctx)
					break

				case 'course_title':
					await handleCourseTitle(conversation, ctx)
					break

				case 'course_description':
					await handleCourseDescription(conversation, ctx)
					break

				case 'course_price':
					await handleCoursePrice(conversation, ctx)
					break

				case 'course_custom_price':
					await handleCourseCustomPrice(conversation, ctx)
					break

				case 'course_create':
					await handleCourseCreate(conversation, ctx)
					break

				case 'course_photo':
					await handleCoursePhoto(conversation, ctx)
					break

				case 'blog_input':
					await handleBlogInput(conversation, ctx)
					break

				case 'broadcast_input':
					await handleBroadcastInput(conversation, ctx)
					break

				default:
					ctx.session.flowState = { step: 'idle' }
					break
			}
		}
	} catch (err) {
		if (isNavSignal(err)) {
			if (err.message === 'START') {
				await showStartMenu(ctx)
				return
			} else if (err.message === 'ADMIN') {
				ctx.session.flowState = { step: 'idle', data: {} }
				await showAdminMainMenu(conversation, ctx)
				return
			} else if (err.message === 'CANCEL') {
				ctx.session.flowState = { step: 'idle', data: {} }
				await showAdminMainMenu(conversation, ctx)
				return
			}
		} else {
			logger.error({ err }, 'Admin flow failed')
			await replaceBotMessage(ctx, '❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
		}
	} finally {
		ctx.session.flowActive = false
		ctx.session.flowState = { step: 'idle' }
	}
}

/* admin applications browser moved to admin-applications.browser.ts */

/* =========================
   MAIN MENU
========================= */

async function showAdminMainMenu(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const isRu = getUserLang(ctx) === 'ru'
	const action = await askChoice(conversation, ctx, isRu ? '*👨‍💼 Админ панель*' : '*👨‍💼 Admin panel*', [
		{ text: isRu ? '📌 Добавить вакансию' : '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
		{ text: isRu ? '🎓 Добавить курс' : '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
		{ text: isRu ? '📋 Список вакансий' : '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
		{ text: isRu ? '📚 Список курсов' : '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' },
		{ text: isRu ? '📨 Заявки' : '📨 Arizalar', data: 'A|APP_LIST' },
		{ text: isRu ? '🎓 Записи на курсы' : '🎓 Kurs yozilishlari', data: 'A|ENROLL_LIST' },
		{ text: isRu ? '📊 Статистика' : '📊 Statistika', data: 'A|STATS' },
		{ text: isRu ? '📸 Ссылка на блог' : '📸 Blog havolasi', data: 'A|BLOG' },
		{ text: isRu ? '📢 Рассылка всем' : '📢 Hammaga xabar', data: 'A|BROADCAST' }
	], { columns: 2 })

	if (!action) {
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|STATS') {
		await showStatistics(conversation, ctx)
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|VAC_LIST') {
		await manageVacancies(conversation, ctx)
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|COURSE_LIST') {
		await manageCourses(conversation, ctx)
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|APP_LIST') {
		await manageApplicationsBrowser(conversation, ctx)
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|ENROLL_LIST') {
		await manageCourseEnrollmentsBrowser(conversation, ctx)
		ctx.session.flowState = { step: 'idle' }
		return
	}

	if (action === 'A|BLOG') {
		ctx.session.flowState = { step: 'blog_input', data: {} }
		return
	}

	if (action === 'A|BROADCAST') {
		ctx.session.flowState = { step: 'broadcast_input', data: {} }
		return
	}

	if (action === 'A|VAC_ADD') {
		ctx.session.flowState = {
			step: 'vacancy_title',
			data: {}
		}
		return
	}

	if (action === 'A|COURSE_ADD') {
		ctx.session.flowState = {
			step: 'course_title',
			data: {}
		}
		return
	}

	ctx.session.flowState = { step: 'idle' }
}

async function handleBlogInput(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const value = await askText(
		conversation,
		ctx,
		adminText(ctx, '📸 Instagram blog havolasini yuboring:\n\nMasalan: https://instagram.com/your.page', '📸 Отправьте ссылку на Instagram:\n\nНапример: https://instagram.com/your.page')
	)
	runtimeSettingsService.update({ instagramUrl: value.trim() })
	await ctx.reply(adminText(ctx, '✅ Havola saqlandi.', '✅ Ссылка сохранена.'))
	ctx.session.flowState = { step: 'idle' }
}

async function handleBroadcastInput(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	await replaceBotMessage(
		ctx,
		adminText(
			ctx,
			`📢 *Hamma userlarga yuboriladigan xabarni yuboring.*

Matn, rasm yoki fayl yuborishingiz mumkin. Bekor qilish uchun /cancel ni bosing.`,
			`📢 *Отправьте сообщение для всех пользователей.*

Можно отправить текст, фото или файл. Для отмены нажмите /cancel.`
		),
		{ parse_mode: 'Markdown' }
	)

	while (true) {
		const upd = await conversation.wait()
		const text = upd.message?.text?.trim()
		if (text === '/cancel') throw navError('CANCEL')
		if (text === '/start') throw navError('START')
		if (text === '/admin') throw navError('ADMIN')
		if (!upd.message?.message_id || !ctx.chat?.id) continue

		const users = await prisma.user.findMany({ select: { telegramId: true } })
		let sentCount = 0
		for (const user of users) {
			try {
				await ctx.api.copyMessage(Number(user.telegramId), ctx.chat.id, upd.message.message_id)
				sentCount++
			} catch (error) {
				logger.warn({ error, telegramId: String(user.telegramId) }, 'Broadcast send failed')
			}
		}
		await ctx.reply(adminText(ctx, `✅ Xabar yuborildi: ${sentCount} ta foydalanuvchi`, `✅ Сообщение отправлено: ${sentCount}`))
		ctx.session.flowState = { step: 'idle' }
		return
	}
}

/* =========================
   VACANCY FLOW
========================= */

async function handleVacancyTitle(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const title = await askText(conversation, ctx, '📌 *Step 1: Vakansiya nomini kiriting*')

	if (!title) {
		ctx.session.flowState = { step: 'idle' }
		return
	}

	ctx.session.flowState = {
		step: 'vacancy_description_decision',
		data: { title }
	}
}

async function handleVacancyDescriptionDecision(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState
	const wantDescription = await askChoice(
		conversation,
		ctx,
		'📝 *Vakansiya tavsifi qoʻshasizmi?*',
		[
			{ text: '✅ Ha', data: 'YES' },
			{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
		]
	)

	if (wantDescription === 'YES') {
		ctx.session.flowState = {
			step: 'vacancy_description_input',
			data: { ...state.data }
		}
		return
	}

	ctx.session.flowState = {
		step: 'vacancy_duplicate_check',
		data: { ...state.data, description: null }
	}
}

async function handleVacancyDescriptionInput(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const description = await askText(
		conversation,
		ctx,
		'📝 *Vakansiya tavsifini kiriting:*\n\n(Vakansiya haqida qoʻshimcha maʼlumot)'
	)

	ctx.session.flowState = {
		step: 'vacancy_duplicate_check',
		data: {
			...state.data,
			description: description || null
		}
	}
}

// async function handleVacancyDuplicateCheck(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext
// ): Promise<void> {
// 	const state = ctx.session.flowState
// 	const title: string = state.data.title

// 	const existingVacancy = await prisma.vacancy.findFirst({
// 		where: {
// 			title: {
// 				equals: title,
// 				mode: 'insensitive'
// 			}
// 		}
// 	})

// 	if (existingVacancy) {
// 		const confirm = await askChoice(
// 			conversation,
// 			ctx,
// 			`⚠️ *${title}* nomli vakansiya allaqachon mavjud!\n\nDavom etilsa, takroriy vakansiya yaratiladi.\n\nDavom etasizmi?`,
// 			[
// 				{ text: '✅ Ha, davom et', data: 'CONTINUE' },
// 				{ text: '❌ Yoʻq, bekor qil', data: 'CANCEL' }
// 			]
// 		)

// 		if (confirm !== 'CONTINUE') {
// 			await ctx.reply('❌ Vakansiya qoʻshish bekor qilindi.')
// 			ctx.session.flowState = { step: 'idle' }
// 			return
// 		}
// 	}

// 	ctx.session.flowState = {
// 		step: 'vacancy_salary',
// 		data: { ...state.data }
// 	}
// }

async function handleVacancyDuplicateCheck(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState
	const title: string = state.data.title

	// MUHIM: DB so'rovini conversation.external() ichida bajaring
	const existingVacancy = await conversation.external(() =>
		prisma.vacancy.findFirst({
			where: {
				title: {
					equals: title,
					mode: 'insensitive'
				}
			}
		})
	)

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
			ctx.session.flowState = { step: 'idle' }
			return
		}
	}

	ctx.session.flowState = {
		step: 'vacancy_salary',
		data: { ...state.data }
	}
}

// async function handleVacancySalary(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext
// ): Promise<void> {
// 	const state = ctx.session.flowState

// 	const salaryChoice = await askChoice(
// 		conversation,
// 		ctx,
// 		'💰 *Step 2: Maoshni tanlang yoki oʻtkazib yuboring*',
// 		[
// 			{ text: '1 000 000 soʻm', data: 'SALARY|1_000_000' },
// 			{ text: '2 000 000 soʻm', data: 'SALARY|2_000_000' },
// 			{ text: '4 000 000 soʻm', data: 'SALARY|4_000_000' },
// 			{ text: 'Kelishiladi', data: 'SALARY|negotiable' },
// 			{ text: '⏭ Oʻtkazib yuborish', data: 'SALARY|SKIP' }
// 		],
// 		{ columns: 2 }
// 	)

// 	let salary: string | null = null

// 	if (salaryChoice) {
// 		const trimmedChoice = salaryChoice.trim()
// 		if (trimmedChoice.startsWith('SALARY|')) {
// 			const salaryValue = trimmedChoice.replace('SALARY|', '')

// 			if (salaryValue === 'SKIP') {
// 				salary = null
// 			} else if (salaryValue === 'negotiable') {
// 				salary = 'Kelishiladi'
// 			} else {
// 				salary = salaryValue.replace(/_/g, ' ') + ' soʻm'
// 			}
// 		}
// 	}

// 	const vacancy = await prisma.vacancy.create({
// 		data: {
// 			title: state.data.title,
// 			description: state.data.description ?? null,
// 			salary,
// 			isActive: true
// 		}
// 	})

// 	await ctx.reply(
// 		salary
// 			? `✅ Vakansiya yaratildi! (Maosh: ${salary})`
// 			: '✅ Vakansiya yaratildi! Maosh kiritilmadi'
// 	)

// 	await cleanupOldCallbacks(conversation)

// 	ctx.session.flowState = {
// 		step: 'vacancy_photo',
// 		data: {
// 			vacancyId: vacancy.id
// 		}
// 	}
// }

async function handleVacancySalary(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

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

	if (salaryChoice) {
		const trimmedChoice = salaryChoice.trim()
		if (trimmedChoice.startsWith('SALARY|')) {
			const salaryValue = trimmedChoice.replace('SALARY|', '')
			if (salaryValue === 'SKIP') {
				salary = null
			} else if (salaryValue === 'negotiable') {
				salary = 'Kelishiladi'
			} else {
				salary = salaryValue.replace(/_/g, ' ') + ' soʻm'
			}
		}
	}

	// MUHIM: DB write ham external() ichida
	const vacancy = await conversation.external(() =>
		prisma.vacancy.create({
			data: {
				title: state.data.title,
				description: state.data.description ?? null,
				salary,
				isActive: true
			}
		})
	)

	await ctx.reply(
		salary
			? `✅ Vakansiya yaratildi! (Maosh: ${salary})`
			: '✅ Vakansiya yaratildi! Maosh kiritilmadi'
	)

	ctx.session.flowState = {
		step: 'vacancy_photo',
		data: { vacancyId: vacancy.id }
	}
}

// async function handleVacancyPhoto(
// 	conversation: Conversation<BotContext>,
// 	ctx: BotContext
// ): Promise<void> {
// 	const state = ctx.session.flowState

// 	console.log('📸 Vakansiya rasmi soʻralmoqda...')
// 	const photoUrl = await uploadVacancyPhoto(conversation, ctx, state.data.vacancyId, false)

// 	if (photoUrl) {
// 		console.log('✅ Vakansiya rasmi yuklandi va saqlandi:', photoUrl)
// 	} else {
// 		console.log('⏭ Vakansiya rasmi yuklanmadi (ixtiyoriy)')
// 	}

// 	await cleanupOldCallbacks(conversation)

// 	ctx.session.flowState = {
// 		step: 'vacancy_question_decision',
// 		data: { vacancyId: state.data.vacancyId }
// 	}
// }

async function handleVacancyPhoto(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState
	const vacancyId = state.data.vacancyId

	const kb = new InlineKeyboard()
		.text('⏭ Oʻtkazib yuborish', 'VAC_PHOTO_SKIP')
		.text('❌ Bekor qilish', 'NAV|CANCEL')

	await ctx.reply(
		[
			'📸 *Vakansiya uchun rasm yuklang*',
			'',
			'• JPG yoki PNG format',
			'• Ixtiyoriy — oʻtkazib yuborishingiz mumkin',
			'',
			'Rasmni yuboring:'
		].join('\n'),
		{ parse_mode: 'Markdown', reply_markup: kb }
	)

	while (true) {
		const upd = await conversation.wait()

		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			await upd.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|CANCEL') throw navError('CANCEL')

			if (data === 'VAC_PHOTO_SKIP') {
				await ctx.reply('⏭ Rasm yuklanmadi')
				ctx.session.flowState = {
					step: 'vacancy_question_decision',
					data: { vacancyId }
				}
				return
			}

			// Eskirgan callbacklar — ignore
			continue
		}

		if (upd.message?.photo?.length) {
			const best = upd.message.photo[upd.message.photo.length - 1]
			const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda...')

			try {
				const file = await ctx.api.getFile(best.file_id)
				if (!file.file_path) {
					await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
					await ctx.reply('❌ Rasmni olishda xatolik. Qayta yuboring.')
					continue
				}

				const axios = (await import('axios')).default
				const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
				const res = await axios.get(url, { responseType: 'arraybuffer' })
				const buffer = Buffer.from(res.data)

				const uploaded = await photoService.uploadBufferToCloudinary(buffer)

				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})

				await prisma.vacancy.update({
					where: { id: vacancyId },
					data: { imageUrl: uploaded.secureUrl }
				})

				await ctx.reply('✅ Vakansiya rasmi yuklandi!')

				ctx.session.flowState = {
					step: 'vacancy_question_decision',
					data: { vacancyId }
				}
				return
			} catch (error) {
				logger.error({ error }, 'Failed to upload vacancy photo')
				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
				await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
				continue
			}
		}

		if (upd.message?.text) {
			const text = upd.message.text.trim()
			if (text === '/cancel') throw navError('CANCEL')
			if (text === '/start') throw navError('START')
			await ctx.reply('Iltimos, rasm yuboring yoki tugmadan foydalaning.')
		}
	}
}

async function handleVacancyQuestionDecision(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const addQuestion = await askChoice(conversation, ctx, '❓ *Savol qoʻshasizmi?*', [
		{ text: '✅ Ha', data: 'YES' },
		{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
	])

	if (addQuestion?.trim() === 'YES') {
		await ctx.reply('Endi savollar qoʻshamiz.')
		ctx.session.flowState = {
			step: 'vacancy_question_add',
			data: { vacancyId: state.data.vacancyId }
		}
		return
	}

	if (addQuestion?.trim() === 'NO') {
		await ctx.reply('✅ Vakansiya muvaffaqiyatli qoʻshildi! (Savollar qoʻshilmadi)')
	} else {
		await ctx.reply('⚠️ Savol qoʻshish bekor qilindi.')
	}

	ctx.session.flowState = { step: 'idle' }
}

async function handleVacancyQuestionAdd(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	await addVacancyQuestion(conversation, ctx, state.data.vacancyId)
	await conversation.sleep(500)

	ctx.session.flowState = {
		step: 'vacancy_question_more',
		data: { vacancyId: state.data.vacancyId }
	}
}

async function handleVacancyQuestionMore(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const more = await askChoice(conversation, ctx, 'Yana savol qoʻshasizmi?', [
		{ text: '➕ Yana savol', data: 'YES' },
		{ text: '✅ Yetarli', data: 'NO' }
	])

	if (more !== null && more.trim() === 'YES') {
		ctx.session.flowState = {
			step: 'vacancy_question_add',
			data: { vacancyId: state.data.vacancyId }
		}
		return
	}

	await ctx.reply('✅ Vakansiya va savollar muvaffaqiyatli qoʻshildi!')
	ctx.session.flowState = { step: 'idle' }
}

/* =========================
   COURSE FLOW
========================= */

async function handleCourseTitle(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const title = await askText(conversation, ctx, '🎓 *Step 1: Kurs nomini kiriting:*')

	if (!title) {
		ctx.session.flowState = { step: 'idle' }
		return
	}

	ctx.session.flowState = {
		step: 'course_description',
		data: { title }
	}
}

async function handleCourseDescription(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const description = await askText(
		conversation,
		ctx,
		'📝 *Step 2: Kurs tavsifini kiriting:*\n\nAgar tavsif kiritmasangiz, ➖ belgisini yuboring.'
	)

	ctx.session.flowState = {
		step: 'course_price',
		data: {
			...state.data,
			description: description === '➖' ? null : description
		}
	}
}

async function handleCoursePrice(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const priceChoice = await askChoice(
		conversation,
		ctx,
		'💰 *Step 3: Kurs narxini tanlang yoki oʻtkazib yuboring*',
		[
			{ text: '500 000 soʻm', data: 'PRICE|500000' },
			{ text: '1 000 000 soʻm', data: 'PRICE|1000000' },
			{ text: '1 500 000 soʻm', data: 'PRICE|1500000' },
			{ text: '2 000 000 soʻm', data: 'PRICE|2000000' },
			{ text: 'Bepul', data: 'PRICE|FREE' },
			{ text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
			{ text: '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
		],
		{ columns: 2 }
	)

	if (!priceChoice || !priceChoice.startsWith('PRICE|')) {
		ctx.session.flowState = {
			step: 'course_create',
			data: {
				...state.data,
				price: null
			}
		}
		return
	}

	const priceValue = priceChoice.replace('PRICE|', '')

	if (priceValue === 'CUSTOM') {
		ctx.session.flowState = {
			step: 'course_custom_price',
			data: { ...state.data }
		}
		return
	}

	let price: string | null = null

	if (priceValue === 'SKIP') {
		price = null
	} else if (priceValue === 'FREE') {
		price = 'Bepul'
	} else {
		price = `${parseInt(priceValue).toLocaleString()} soʻm`
	}

	ctx.session.flowState = {
		step: 'course_create',
		data: {
			...state.data,
			price
		}
	}
}

async function handleCourseCustomPrice(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const customPrice = await askText(
		conversation,
		ctx,
		'💰 *Narxni kiriting:*\n\nMasalan: 750000 yoki 1.2 mln'
	)

	const cleanPrice = (customPrice || '').replace(/[^0-9]/g, '')
	const price = cleanPrice ? `${parseInt(cleanPrice).toLocaleString()} soʻm` : null

	ctx.session.flowState = {
		step: 'course_create',
		data: {
			...state.data,
			price
		}
	}
}

async function handleCourseCreate(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState

	const course = await conversation.external(() =>
		prisma.course.create({
			data: {
				title: state.data.title,
				description: state.data.description ?? null,
				price: state.data.price ?? null,
				isActive: true
			}
		})
	)

	await ctx.reply(
		state.data.price
			? `✅ Kurs muvaffaqiyatli qoʻshildi! (Narx: ${state.data.price})`
			: '✅ Kurs muvaffaqiyatli qoʻshildi! (Narx kiritilmadi)'
	)

	await cleanupOldCallbacks(conversation)

	ctx.session.flowState = {
		step: 'course_photo',
		data: { courseId: course.id }
	}
}
async function handleCoursePhoto(
	conversation: Conversation<BotContext>,
	ctx: BotContext
): Promise<void> {
	const state = ctx.session.flowState
	const courseId = state.data.courseId

	const kb = new InlineKeyboard()
		.text('⏭ Oʻtkazib yuborish', 'COURSE_PHOTO_SKIP')
		.text('❌ Bekor qilish', 'NAV|CANCEL')

	await ctx.reply(
		[
			'📸 *Kurs uchun rasm yuklang*',
			'',
			'• JPG yoki PNG format',
			'• Ixtiyoriy — oʻtkazib yuborishingiz mumkin',
			'• Rasm kurs haqida maʼlumot berishi mumkin',
			'',
			'Rasmni yuboring:'
		].join('\n'),
		{ parse_mode: 'Markdown', reply_markup: kb }
	)

	while (true) {
		const upd = await conversation.wait()

		// CALLBACK QUERY HANDLER
		if (upd.callbackQuery) {
			const data = upd.callbackQuery.data
			await upd.answerCallbackQuery().catch(() => {})

			if (data === 'NAV|CANCEL') throw navError('CANCEL')

			if (data === 'COURSE_PHOTO_SKIP') {
				await ctx.reply('⏭ Kurs rasmi yuklanmadi')
				ctx.session.flowState = { step: 'idle' }
				return
			}

			// Boshqa callbacklarni ignore qilish
			continue
		}

		// PHOTO HANDLER
		if (upd.message?.photo?.length) {
			const best = upd.message.photo[upd.message.photo.length - 1]
			const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda...')

			try {
				// Telegram dan file olish
				const file = await ctx.api.getFile(best.file_id)
				if (!file.file_path) {
					await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
					await ctx.reply('❌ Rasmni olishda xatolik. Qayta yuboring.')
					continue
				}

				// File ni yuklab olish
				const axios = (await import('axios')).default
				const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
				const res = await axios.get(url, { responseType: 'arraybuffer' })
				const buffer = Buffer.from(res.data)

				// Cloudinary ga yuklash
				const uploaded = await photoService.uploadBufferToCloudinary(buffer)

				// Yuklanayotgan xabarni o'chirish
				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})

				// Database ga saqlash
				await prisma.course.update({
					where: { id: courseId },
					data: { imageUrl: uploaded.secureUrl }
				})

				await ctx.reply('✅ Kurs rasmi muvaffaqiyatli yuklandi!')

				// Flow ni tugatish
				ctx.session.flowState = { step: 'idle' }
				return
			} catch (error) {
				logger.error({ error }, 'Failed to upload course photo')
				await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => {})
				await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
				continue
			}
		}

		// TEXT HANDLER
		if (upd.message?.text) {
			const text = upd.message.text.trim()
			if (text === '/cancel') throw navError('CANCEL')
			if (text === '/start') throw navError('START')
			await ctx.reply('Iltimos, rasm yuboring yoki tugmadan foydalaning.')
		}
	}
}

/* =========================
   HELPERS
========================= */

async function cleanupOldCallbacks(conversation: Conversation<BotContext>): Promise<void> {
	console.log('🧹 cleanupOldCallbacks: pass-through mode')
	await conversation.sleep(50)
}
