import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard, InputFile } from 'grammy'
import fs from 'node:fs'
import path from 'node:path'

import type { BotContext } from '../bot'
import { logger } from '../../utils/logger'
import { prisma } from '../../db/prisma'
import { askText, askChoice, replaceBotMessage, navError, isNavSignal, escapeMarkdown } from './flow-helpers'
import { showStartMenu } from '../start.menu'
import { exportToExcel } from '../../utils/excel-export'
import { photoService } from '../../services/photo.service'
import { FileType } from '@prisma/client'
import { CallbackData } from '../../config/constants'

type AdminNavSignal = 'START' | 'ADMIN'

const adminNavError = (sig: AdminNavSignal) => new Error(sig)

function isAdminNavSignal(err: unknown): err is Error {
  return err instanceof Error && (err.message === 'START' || err.message === 'ADMIN')
}

function isAdmin(ctx: BotContext): boolean {
  const admin1 = Number(process.env.ADMIN_CHAT_ID || 0)
  const admin2 = Number(process.env.ADMIN_CHAT_ID_2 || 0)
  const id = ctx.from?.id
  return Boolean(id && (id === admin1 || id === admin2))
}

// ==================== VACANCY PHOTO UPLOAD ====================

/**
 * Vakansiya uchun rasm yuklash
 * Bu funksiya savollardan OLDIN ishlaydi
 */


// admin.flow.ts ga qo'shiladigan funksiya - KURS UCHUN RASM YUKLASH

/**
 * Kurs uchun rasm yuklash
 * Bu funksiya kurs qo'shishda savollardan OLDIN ishlaydi
 */
async function uploadCoursePhoto(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string
): Promise<string | null> {
  let lastMessageId: number | null = null
  let loadingMessageId: number | null = null

  const kb = new InlineKeyboard()
    .text("📋 Qoidani ko'rsat", CallbackData.COURSE_PHOTO_RULES)
    .row()
    .text('⏭ Oʻtkazib yuborish', CallbackData.COURSE_PHOTO_SKIP)
    .text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

  // Rasm so'rash xabari
  const sentMsg = await ctx.reply(
    [
      '📸 *Kurs uchun rasm yuklang*',
      '',
      '✅ *Talablar (ixtiyoriy):*',
      '• Rasm kurs dizayni uchun ishlatiladi',
      '• JPG yoki PNG format',
      '• Rasm kurs haqida maʼlumot berishi mumkin',
      '',
      'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
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
        await ctx.reply('⏭ Kurs rasmi yuklanmadi (ixtiyoriy)')
        return null
      }

      if (data === CallbackData.COURSE_PHOTO_RULES) {
        // Qoidani ko'rsatish
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
            'Rasm yuboring yoki "Oʻtkazib yuborish" tugmasini bosing:'
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: kb }
        )
        lastMessageId = rulesMsg.message_id
        continue
      }
    }

    // Rasm tekshirish
    if (u.message?.photo?.length) {
      // Rasm qabul qilindi
      const best = u.message.photo[u.message.photo.length - 1]

      // "Yuklanmoqda" xabarini yuborish
      const loadingMsg = await ctx.reply('⏳ Kurs rasmi yuklanmoqda, biroz kuting...')
      loadingMessageId = loadingMsg.message_id

      try {
        // Rasmni validatsiya qilish (minimal tekshirish)
        const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
          minWidth: 100,
          minHeight: 100,
          minRatio: 0.1,
          maxRatio: 10
        })

        if (!validated.ok) {
          // Yuklanmoqda xabarini o'chirish
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
          continue
        }

        // Cloudinary ga yuklash
        const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)

        // Yuklanmoqda xabarini o'chirish
        if (loadingMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
          } catch (error) {
            // ignore
          }
        }

        // Rasm ma'lumotlarini saqlash
        console.log(`✅ Kurs rasmi yuklandi: ${uploaded.secureUrl}`)

        await ctx.reply('✅ Kurs rasmi muvaffaqiyatli yuklandi!')
        return uploaded.secureUrl

      } catch (error) {
        logger.error({ error }, 'Failed to upload course photo')
        
        // Yuklanmoqda xabarini o'chirish
        if (loadingMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
          } catch (error) {
            // ignore
          }
        }
        
        await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
        continue
      }
    }

    // Matn xabar - e'tiborsiz qoldirish
    if (u.message?.text) {
      await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.')
      continue
    }
  }
}
// async function uploadVacancyPhoto(
//   conversation: Conversation<BotContext>,
//   ctx: BotContext,
//   vacancyId: string
// ): Promise<string | null> {
//   let lastMessageId: number | null = null
//   let loadingMessageId: number | null = null

//   const kb = new InlineKeyboard()
//     .text("📋 Qoidani ko'rsat", 'VAC_PHOTO|RULES')
//     .row()
//     .text('⏭ Oʻtkazib yuborish', 'VAC_PHOTO|SKIP')
//     .text('❌ Bekor qilish', 'NAV|CANCEL')

//   // Rasm so'rash xabari
//   const sentMsg = await ctx.reply(
//     [
//       '📸 *Vakansiya uchun rasm yuklang*',
//       '',
//       '✅ *Talablar (ixtiyoriy):*',
//       '• Rasm vakansiya dizayni uchun ishlatiladi',
//       '• JPG yoki PNG format',
//       '• Rasm arizada savol sifatida chiqmaydi',
//       '',
//       'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
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

//       if (data === 'NAV|CANCEL') throw navError('CANCEL')
//       if (data === 'VAC_PHOTO|SKIP') {
//         await ctx.reply('⏭ Rasm yuklanmadi (ixtiyoriy)')
//         return null
//       }

//       if (data === 'VAC_PHOTO|RULES') {
//         // Qoidani ko'rsatish
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
//             '• Vakansiyaga mos rasm',
//             '',
//             '❌ *Qabul qilinmaydi:*',
//             '• Video fayllar',
//             '• Hajmi juda kichik',
//             '',
//             'Rasm yuboring yoki "Oʻtkazib yuborish" tugmasini bosing:'
//           ].join('\n'),
//           { parse_mode: 'Markdown', reply_markup: kb }
//         )
//         lastMessageId = rulesMsg.message_id
//         continue
//       }
//     }

//     // Rasm tekshirish
//     if (u.message?.photo?.length) {
//       // Rasm qabul qilindi
//       const best = u.message.photo[u.message.photo.length - 1]

//       // "Yuklanmoqda" xabarini yuborish
//       const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
//       loadingMessageId = loadingMsg.message_id

//       try {
//         // Rasmni validatsiya qilish (minimal tekshirish)
//         const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
//           minWidth: 100,
//           minHeight: 100,
//           minRatio: 0.1,
//           maxRatio: 10
//         })

//         if (!validated.ok) {
//           // Yuklanmoqda xabarini o'chirish
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

//         // Cloudinary ga yuklash
//         const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)

//         // Yuklanmoqda xabarini o'chirish
//         if (loadingMessageId) {
//           try {
//             await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
//           } catch (error) {
//             // ignore
//           }
//         }

//         // Rasm ma'lumotlarini saqlash
//         console.log(`✅ Vakansiya rasmi yuklandi: ${uploaded.secureUrl}`)

//         await ctx.reply('✅ Rasm muvaffaqiyatli yuklandi!')
//         return uploaded.secureUrl

//       } catch (error) {
//         logger.error({ error }, 'Failed to upload vacancy photo')
        
//         // Yuklanmoqda xabarini o'chirish
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

//     // Matn xabar - e'tiborsiz qoldirish
//     if (u.message?.text) {
//       await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.')
//       continue
//     }
//   }
// }


// admin.flow.ts dagi uploadVacancyPhoto funksiyasi - CALLBACKDATA BILAN YANGILANGAN

async function uploadVacancyPhoto(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  vacancyId: string
): Promise<string | null> {
  let lastMessageId: number | null = null
  let loadingMessageId: number | null = null

  const kb = new InlineKeyboard()
    .text("📋 Qoidani ko'rsat", CallbackData.VAC_PHOTO_RULES)
    .row()
    .text('⏭ Oʻtkazib yuborish', CallbackData.VAC_PHOTO_SKIP)
    .text('❌ Bekor qilish', CallbackData.NAV_CANCEL)

  // Rasm so'rash xabari
  const sentMsg = await ctx.reply(
    [
      '📸 *Vakansiya uchun rasm yuklang*',
      '',
      '✅ *Talablar (ixtiyoriy):*',
      '• Rasm vakansiya dizayni uchun ishlatiladi',
      '• JPG yoki PNG format',
      '• Rasm arizada savol sifatida chiqmaydi',
      '',
      'Rasm yuklamoqchi boʻlsangiz yuboring, aks holda "Oʻtkazib yuborish" tugmasini bosing:'
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
      if (data === CallbackData.VAC_PHOTO_SKIP) {
        await ctx.reply('⏭ Rasm yuklanmadi (ixtiyoriy)')
        return null
      }

      if (data === CallbackData.VAC_PHOTO_RULES) {
        // Qoidani ko'rsatish
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
            '• Vakansiyaga mos rasm',
            '',
            '❌ *Qabul qilinmaydi:*',
            '• Video fayllar',
            '• Hajmi juda kichik',
            '',
            'Rasm yuboring yoki "Oʻtkazib yuborish" tugmasini bosing:'
          ].join('\n'),
          { parse_mode: 'Markdown', reply_markup: kb }
        )
        lastMessageId = rulesMsg.message_id
        continue
      }
    }

    // Rasm tekshirish
    if (u.message?.photo?.length) {
      // Rasm qabul qilindi
      const best = u.message.photo[u.message.photo.length - 1]

      // "Yuklanmoqda" xabarini yuborish
      const loadingMsg = await ctx.reply('⏳ Rasm yuklanmoqda, biroz kuting...')
      loadingMessageId = loadingMsg.message_id

      try {
        // Rasmni validatsiya qilish (minimal tekshirish)
        const validated = await photoService.validateTelegramPhoto(ctx, best.file_id, {
          minWidth: 100,
          minHeight: 100,
          minRatio: 0.1,
          maxRatio: 10
        })

        if (!validated.ok) {
          // Yuklanmoqda xabarini o'chirish
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
          continue
        }

        // Cloudinary ga yuklash
        const uploaded = await photoService.uploadBufferToCloudinary(validated.buffer)

        // Yuklanmoqda xabarini o'chirish
        if (loadingMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
          } catch (error) {
            // ignore
          }
        }

        // Rasm ma'lumotlarini saqlash
        console.log(`✅ Vakansiya rasmi yuklandi: ${uploaded.secureUrl}`)

        await ctx.reply('✅ Rasm muvaffaqiyatli yuklandi!')
        return uploaded.secureUrl

      } catch (error) {
        logger.error({ error }, 'Failed to upload vacancy photo')
        
        // Yuklanmoqda xabarini o'chirish
        if (loadingMessageId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, loadingMessageId)
          } catch (error) {
            // ignore
          }
        }
        
        await ctx.reply('❌ Rasmni yuklashda xatolik. Qayta urinib koʻring.')
        continue
      }
    }

    // Matn xabar - e'tiborsiz qoldirish
    if (u.message?.text) {
      await ctx.reply('Iltimos, rasm yuboring yoki tugmalardan foydalaning.')
      continue
    }
  }
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

      text += `${v.isActive ? '✅' : '⛔️'} *${v.title}* ${repeatIcon}\n`
      text += `   ${salaryIcon} ${v.salary || 'Maosh kiritilmagan'}\n`
      text += `   🆔 ${v.id.slice(0, 8)}\n`
      text += `   📅 ${new Date(v.createdAt).toLocaleDateString()}\n\n`

      kb.text(`${v.title} (${v.id.slice(0, 4)})`, `VAC|VIEW|${v.id}`).row()
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

  const text = [
    `📌 *${vacancy.title}*`,
    hasSalary ? `💰 *Maosh:* ${vacancy.salary}` : `💰 *Maosh:* Kiritilmagan`,
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
    .text('🔀 Faollik', `VAC_EDIT|TOGGLE|${vacancy.id}`)
    .text('❓ Savollar', `VAC_QUESTIONS|${vacancy.id}`)
    .row()
    .text('📋 Arizalar', `VAC_APPLICATIONS|${vacancy.id}`)
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
    const newTitle = await askText(conversation, ctx, `✏️ *Yangi nom* (hozirgi: ${vacancy.title}):`)
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
    where: { vacancyId },
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
      include: { options: true },
      orderBy: { order: 'asc' }
    })

    let text = '❓ *Vakansiya savollari*\n\n'
    const kb = new InlineKeyboard()

    if (questions.length === 0) {
      text += 'Hozircha savollar yo‘q.'
    } else {
      questions.forEach((q, idx) => {
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

async function addVacancyQuestion(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  vacancyId: string
): Promise<void> {
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

    while (addMore) {
      const optText = await askText(
        conversation,
        ctx,
        `📋 *Variant ${optIndex + 1} nomini kiriting:*`
      )
      if (!optText) return

      options.push({
        text: optText,
        value: `opt_${Date.now()}_${optIndex}`
      })
      optIndex++

      if (optIndex >= 1) {
        const more = await askChoice(conversation, ctx, 'Yana variant qo‘shasizmi?', [
          { text: '➕ Ha', data: 'YES' },
          { text: '✅ Yetarli', data: 'NO' }
        ])
        addMore = more !== null && more.trim() === 'YES'
      }
    }
  }

  const orderStr = await askText(conversation, ctx, '🔢 *Tartib raqami (0 dan):*')
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
  }

  await ctx.reply(`✅ Savol qoʻshildi! (ID: ${created.id.slice(0, 8)})`)
}

// ==================== COURSE MANAGEMENT ====================

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
      text += `• ${course.isActive ? '✅' : '⛔️'} *${course.title}*\n`
      
      // MUHIM: Narxni to'g'ri formatlash - "so'm" ikki marta yozilmasligi uchun
      let priceText = 'Kiritilmagan'
      if (course.price) {
        if (course.price.includes('soʻm') || course.price.includes("so'm")) {
          priceText = course.price
        } else {
          priceText = `${course.price} soʻm`
        }
      }
      
      text += `  💰 Narxi: ${priceText}\n`
      if (course.description) {
        text += `  📝 ${course.description.substring(0, 50)}${
          course.description.length > 50 ? '...' : ''
        }\n`
      }
      text += '\n'
      kb.text(course.title, `COURSE|VIEW|${course.id}`).row()
    })

    if (page > 0) kb.text('⬅️ Oldingi', 'COURSE|PAGE|PREV')
    if (page < totalPages - 1) kb.text('➡️ Keyingi', 'COURSE|PAGE|NEXT')
    kb.row().text('🏠 Bosh menyu', 'NAV|BACK')

    await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
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
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { questions: { include: { options: true } } }
  })

  if (!course) return

  const hasPrice = course.price !== null && course.price !== ''

  // MUHIM: Narxni to'g'ri formatlash - "so'm" ikki marta yozilmasligi uchun
  let priceText = 'Kiritilmagan'
  if (hasPrice && course.price) {
    if (course.price.includes('soʻm') || course.price.includes("so'm")) {
      priceText = course.price
    } else {
      priceText = `${course.price} soʻm`
    }
  }

  // MUHIM: Tavsifni escape qilish
  const escapedDescription = course.description
    ? escapeMarkdown(course.description)
    : null

  const text = [
    `🎓 *${escapeMarkdown(course.title)}*`,
    '',
    escapedDescription
      ? `📝 *Tavsif:*\n${escapedDescription}`
      : '📝 *Tavsif:* Kiritilmagan',
    '',
    `💰 *Narxi:* ${priceText}`,
    `⚡️ *Holat:* ${course.isActive ? 'Faol' : 'Faol emas'}`,
    `❓ *Savollar:* ${course.questions?.length || 0} ta`,
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

  kb.text('🔀 Faollik', `COURSE_EDIT|TOGGLE|${course.id}`)
    .row()
    .text('❓ Savollar', `COURSE_QUESTIONS|${course.id}`)
    .text('📋 Yozilishlar', `COURSE_ENROLLMENTS|${course.id}`)
    .row()
    .text('🗑 Oʻchirish', `COURSE_DELETE|${course.id}`)
    .row()
    .text('⬅️ Orqaga', 'COURSE_BACK')

  await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

  const upd = await conversation.wait()
  const data = upd.callbackQuery?.data
  if (!data) return
  await upd.answerCallbackQuery().catch(() => {})

  if (data === 'COURSE_BACK') return

  if (data.startsWith('COURSE_EDIT|TITLE|')) {
    const newTitle = await askText(
      conversation,
      ctx,
      `✏️ *Yangi nom* (hozirgi: ${escapeMarkdown(course.title)}):`
    )
    if (newTitle) {
      await prisma.course.update({ where: { id: courseId }, data: { title: newTitle } })
      await ctx.reply('✅ Nomi yangilandi!')
    }
    await viewCourse(conversation, ctx, courseId)
    return
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
      await prisma.course.update({ where: { id: courseId }, data: { description } })
      await ctx.reply(description ? '✅ Tavsif yangilandi!' : '✅ Tavsif oʻchirildi!')
    }
    await viewCourse(conversation, ctx, courseId)
    return
  }

  if (data.startsWith('COURSE_EDIT|PRICE|') || data.startsWith('COURSE_EDIT|ADD_PRICE|')) {
    await editCoursePrice(conversation, ctx, courseId, data.startsWith('COURSE_EDIT|PRICE|'))
    await viewCourse(conversation, ctx, courseId)
    return
  }

  if (data.startsWith('COURSE_EDIT|TOGGLE|')) {
    await prisma.course.update({
      where: { id: courseId },
      data: { isActive: !course.isActive }
    })
    await ctx.reply(`✅ Kurs ${!course.isActive ? 'faollashtirildi' : 'faolsizlashtirildi'}`)
    await viewCourse(conversation, ctx, courseId)
    return
  }

  if (data.startsWith('COURSE_QUESTIONS|')) {
    await manageCourseQuestions(conversation, ctx, courseId)
    return
  }

  if (data.startsWith('COURSE_ENROLLMENTS|')) {
    await viewCourseEnrollments(conversation, ctx, courseId)
    return
  }

  if (data.startsWith('COURSE_DELETE|')) {
    const confirm = await askChoice(conversation, ctx, '⚠️ *Rostdan ham oʻchirilsinmi?*', [
      { text: '✅ Ha', data: 'YES' },
      { text: '❌ Yoʻq', data: 'NO' }
    ])
    if (confirm === 'YES') {
      await prisma.course.delete({ where: { id: courseId } })
      await ctx.reply('✅ Kurs oʻchirildi')
    }
    return
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
      return `${idx + 1}. ${e.user.fullName || "Noma'lum"} - ${e.status} - ${new Date(
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
  const course = await prisma.course.findUnique({ where: { id: courseId } })
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
      await prisma.course.update({ where: { id: courseId }, data: { price: null } })
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
    await prisma.course.update({
      where: { id: courseId },
      data: { price: newPrice }
    })
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
      questions.forEach((q, idx) => {
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

  let statsText = [
    '📊 *Umumiy statistika*',
    '',
    `👥 Foydalanuvchilar: *${userCount}*`,
    `📨 Jami arizalar: *${applicationCount}*`,
    `🆕 Yangi/submitted arizalar: *${submittedCount}*`,
    `✅ Qabul qilingan arizalar: *${approvedCount}*`,
    `❌ Rad etilgan arizalar: *${rejectedCount}*`,
    '',
    `🎓 Jami kurs yozilishlar: *${courseCount}*`,
    `✅ Qabul qilingan kurs yozilishlar: *${courseApproved}*`,
    ''
  ].join('\n')

  if (topCourses.length) {
    statsText += '\n*🏆 Top kurslar:*\n'
    topCourses.forEach((course, idx) => {
      statsText += `\n${idx + 1}. ${course.title} — ${course._count.enrollments} ta`
    })
    statsText += '\n'
  }

  if (topVacancies.length) {
    statsText += '\n*🏆 Top vakansiyalar:*\n'
    topVacancies.forEach((vacancy, idx) => {
      statsText += `\n${idx + 1}. ${vacancy.title} — ${vacancy._count.applications} ta`
    })
  }

  // Export tugmasi bilan birga chiqaramiz
  const kb = new InlineKeyboard().text('📥 Excel formatida yuklab olish', 'STATS|EXPORT')

  await replaceBotMessage(ctx, statsText, {
    parse_mode: 'Markdown',
    reply_markup: kb
  })

  const upd = await conversation.wait()
  const data = upd.callbackQuery?.data
  if (!data) return
  await upd.answerCallbackQuery().catch(() => {})

  if (data === 'STATS|EXPORT') {
    await exportStatistics(conversation, ctx)
  }
}

async function exportStatistics(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  await ctx.reply('⏳ Statistika tayyorlanmoqda...')

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

    // Excel fayl yaratish
    const buffer = await exportToExcel(applications, courses)

    // Faylni yuborish
    await ctx.replyWithDocument(new InputFile(buffer, 'statistika.xlsx'), {
      caption: '📊 Statistika Excel formatida'
    })
  } catch (error) {
    logger.error({ error }, 'Excel export failed')
    await ctx.reply('❌ Statistika yuklab olishda xatolik yuz berdi.')
  }
}

// ==================== MAIN ADMIN FLOW ====================

export async function adminFlow(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔️ Ruxsat yo‘q. Siz admin emassiz.')
    return
  }

  try {
    while (true) {
			const action = await askChoice(conversation, ctx, '*👨‍💼 Admin panel*', [
				{ text: '📌 Vakansiya qo‘shish', data: 'A|VAC_ADD' },
				{ text: '🎓 Kurs qo‘shish', data: 'A|COURSE_ADD' },
				{ text: '📋 Vakansiyalar ro‘yxati', data: 'A|VAC_LIST' },
				{ text: '📚 Kurslar ro‘yxati', data: 'A|COURSE_LIST' },
				{ text: '📨 Arizalar', data: 'A|APP_LIST' },
				{ text: '📊 Statistika', data: 'A|STATS' }
			])

			if (!action) continue

			if (action === 'A|STATS') {
				await showStatistics(conversation, ctx)
				continue
			}

			if (action === 'A|VAC_LIST') {
				await manageVacancies(conversation, ctx)
				continue
			}

			if (action === 'A|COURSE_LIST') {
				await manageCourses(conversation, ctx)
				continue
			}

			if (action === 'A|APP_LIST') {
				await ctx.reply('📨 Arizalar boʻlimi ishga tushirilmoqda...')
				continue
			}

			// ==================== VACANCY ADD WITH PHOTO AND CLEANUP ====================
			if (action === 'A|VAC_ADD') {
				// Step 1: Vakansiya nomi
				const title = await askText(conversation, ctx, '📌 *Step 1: Vakansiya nomini kiriting*')
				if (!title) continue

				// MAVJUD VAKANSIYANI TEKSHIRISH
				const existingVacancy = await prisma.vacancy.findFirst({
					where: {
						title: {
							equals: title,
							mode: 'insensitive'
						}
					}
				})

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
						continue
					}
				}

				// Step 2: Maosh so'rash - OPTIONAL
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

				console.log('Salary choice raw:', salaryChoice)

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

				// Vakansiyani yaratish
				const vacancy = await prisma.vacancy.create({
					data: {
						title,
						salary: salary,
						isActive: true
					}
				})

				await ctx.reply(
					salary
						? `✅ Vakansiya yaratildi! (Maosh: ${salary})`
						: `✅ Vakansiya yaratildi! Maosh kiritilmadi`
				)

				// ========== MUHIM: ESKI CALLBACKLARNI TOZALASH ==========
				console.log('🧹 Eski callbacklarni tozalash...')

				// Eski callbacklarni yig'ishtirish
				let cleanedCount = 0
				const maxCleanup = 5

				while (cleanedCount < maxCleanup) {
					try {
						// 200ms kutish bilan eski callbacklarni yig'ish
						const oldUpd = await Promise.race([
							conversation.wait(),
							new Promise(resolve => setTimeout(resolve, 200))
						])

						if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
							await oldUpd.answerCallbackQuery().catch(() => {})
							console.log(
								`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
								oldUpd.callbackQuery.data
							)
							cleanedCount++
						} else {
							// Agar callback kelmasa, tozalashni to'xtat
							break
						}
					} catch (e) {
						// Timeout yoki xatolik bo'lsa, tozalashni to'xtat
						console.log('Eski callbacklar yoʻq yoki vaqt tugadi')
						break
					}
				}

				console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
				await conversation.sleep(500)
				// ========== TOZALASH TUGADI ==========

				// ========== RASM YUKLASH (SAVOLLARDAN OLDIN) ==========
				console.log('📸 Vakansiya rasmi soʻralmoqda...')
				const photoUrl = await uploadVacancyPhoto(conversation, ctx, vacancy.id)
				if (photoUrl) {
					console.log('✅ Rasm yuklandi:', photoUrl)
				}
				// ========== RASM YUKLASH TUGADI ==========

				// Savol qo'shishni so'rash
				const addQuestion = await askChoice(conversation, ctx, '❓ *Savol qoʻshasizmi?*', [
					{ text: '✅ Ha', data: 'YES' },
					{ text: '⏭ Oʻtkazib yuborish', data: 'NO' }
				])

				console.log('Savol qoʻshish natijasi:', addQuestion)

				if (addQuestion && addQuestion.trim() === 'YES') {
					await ctx.reply('Endi savollar qoʻshamiz.')

					let addMore = true
					while (addMore) {
						await addVacancyQuestion(conversation, ctx, vacancy.id)

						await conversation.sleep(500) // Har bir savoldan keyin kutish

						const more = await askChoice(conversation, ctx, 'Yana savol qoʻshasizmi?', [
							{ text: '➕ Yana savol', data: 'YES' },
							{ text: '✅ Yetarli', data: 'NO' }
						])

						// MUHIM: TypeScript xatosini tuzatish
						addMore = more !== null && more.trim() === 'YES'
					}

					await ctx.reply('✅ Vakansiya va savollar muvaffaqiyatli qoʻshildi!')
				} else if (addQuestion && addQuestion.trim() === 'NO') {
					await ctx.reply('✅ Vakansiya muvaffaqiyatli qoʻshildi! (Savollar qoʻshilmadi)')
				} else {
					await ctx.reply('⚠️ Savol qoʻshish bekor qilindi.')
				}
				continue
			}

			// if (action === 'A|COURSE_ADD') {
			//   // Step 1: Kurs nomi
			//   const title = await askText(conversation, ctx, '🎓 *Step 1: Kurs nomini kiriting:*')
			//   if (!title) continue

			//   // Step 2: Kurs tavsifi (OPTIONAL)
			//   const description = await askText(
			//     conversation,
			//     ctx,
			//     '📝 *Step 2: Kurs tavsifini kiriting:*\n\nAgar tavsif kiritmasangiz, ➖ belgisini yuboring.'
			//   )

			//   // Step 3: Kurs narxi (OPTIONAL)
			//   const priceChoice = await askChoice(
			//     conversation,
			//     ctx,
			//     '💰 *Step 3: Kurs narxini tanlang yoki oʻtkazib yuboring*',
			//     [
			//       { text: '500 000 soʻm', data: 'PRICE|500000' },
			//       { text: '1 000 000 soʻm', data: 'PRICE|1000000' },
			//       { text: '1 500 000 soʻm', data: 'PRICE|1500000' },
			//       { text: '2 000 000 soʻm', data: 'PRICE|2000000' },
			//       { text: 'Bepul', data: 'PRICE|FREE' },
			//       { text: 'Boshqa narx', data: 'PRICE|CUSTOM' },
			//       { text: '⏭ Oʻtkazib yuborish', data: 'PRICE|SKIP' }
			//     ],
			//     { columns: 2 }
			//   )

			//   let price: string | null = null

			//   if (priceChoice && priceChoice.startsWith('PRICE|')) {
			//     const priceValue = priceChoice.replace('PRICE|', '')

			//     if (priceValue === 'SKIP') {
			//       price = null
			//     } else if (priceValue === 'FREE') {
			//       price = 'Bepul'
			//     } else if (priceValue === 'CUSTOM') {
			//       const customPrice = await askText(
			//         conversation,
			//         ctx,
			//         '💰 *Narxni kiriting:*\n\nMasalan: 750000 yoki 1.2 mln'
			//       )
			//       const cleanPrice = customPrice.replace(/[^0-9]/g, '')
			//       price = cleanPrice ? `${parseInt(cleanPrice).toLocaleString()} soʻm` : null
			//     } else {
			//       price = `${parseInt(priceValue).toLocaleString()} soʻm`
			//     }
			//   }

			//   // Kursni yaratish
			//   await prisma.course.create({
			//     data: {
			//       title,
			//       description: description === '➖' ? null : description,
			//       price,
			//       isActive: true
			//     }
			//   })

			//   await ctx.reply(
			//     price
			//       ? `✅ Kurs muvaffaqiyatli qoʻshildi! (Narx: ${price})`
			//       : '✅ Kurs muvaffaqiyatli qoʻshildi! (Narx kiritilmadi)'
			//   )
			//   continue
			// }

			// admin.flow.ts dagi COURSE_ADD qismi - TO'LIQ YANGILANGAN

			if (action === 'A|COURSE_ADD') {
				// Step 1: Kurs nomi
				const title = await askText(conversation, ctx, '🎓 *Step 1: Kurs nomini kiriting:*')
				if (!title) continue

				// Step 2: Kurs tavsifi (OPTIONAL)
				const description = await askText(
					conversation,
					ctx,
					'📝 *Step 2: Kurs tavsifini kiriting:*\n\nAgar tavsif kiritmasangiz, ➖ belgisini yuboring.'
				)

				// Step 3: Kurs narxi (OPTIONAL)
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

				let price: string | null = null

				if (priceChoice && priceChoice.startsWith('PRICE|')) {
					const priceValue = priceChoice.replace('PRICE|', '')

					if (priceValue === 'SKIP') {
						price = null
					} else if (priceValue === 'FREE') {
						price = 'Bepul'
					} else if (priceValue === 'CUSTOM') {
						const customPrice = await askText(
							conversation,
							ctx,
							'💰 *Narxni kiriting:*\n\nMasalan: 750000 yoki 1.2 mln'
						)
						const cleanPrice = customPrice.replace(/[^0-9]/g, '')
						price = cleanPrice ? `${parseInt(cleanPrice).toLocaleString()} soʻm` : null
					} else {
						price = `${parseInt(priceValue).toLocaleString()} soʻm`
					}
				}

				// Kursni yaratish
				const course = await prisma.course.create({
					data: {
						title,
						description: description === '➖' ? null : description,
						price,
						isActive: true
					}
				})

				await ctx.reply(
					price
						? `✅ Kurs muvaffaqiyatli qoʻshildi! (Narx: ${price})`
						: '✅ Kurs muvaffaqiyatli qoʻshildi! (Narx kiritilmadi)'
				)

				// ========== MUHIM: ESKI CALLBACKLARNI TOZALASH ==========
				console.log('🧹 Kurs uchun eski callbacklarni tozalash...')

				let cleanedCount = 0
				const maxCleanup = 5

				while (cleanedCount < maxCleanup) {
					try {
						const oldUpd = await Promise.race([
							conversation.wait(),
							new Promise(resolve => setTimeout(resolve, 200))
						])

						if (oldUpd && 'callbackQuery' in oldUpd && oldUpd.callbackQuery) {
							await oldUpd.answerCallbackQuery().catch(() => {})
							console.log(
								`🧹 ${cleanedCount + 1}-eski callback tozalandi:`,
								oldUpd.callbackQuery.data
							)
							cleanedCount++
						} else {
							break
						}
					} catch (e) {
						console.log('Eski callbacklar yoʻq yoki vaqt tugadi')
						break
					}
				}

				console.log(`🧹 Jami tozalangan: ${cleanedCount} ta eski callback`)
				await conversation.sleep(500)
				// ========== TOZALASH TUGADI ==========

				// ========== KURS RASMI YUKLASH (ixtiyoriy) ==========
				console.log('📸 Kurs rasmi soʻralmoqda...')
				const photoUrl = await uploadCoursePhoto(conversation, ctx, course.id)
				if (photoUrl) {
					console.log('✅ Kurs rasmi yuklandi:', photoUrl)
					// Agar kurs modelida rasm maydoni bo'lsa, uni saqlash mumkin
					// await prisma.course.update({
					//   where: { id: course.id },
					//   data: { imageUrl: photoUrl }
					// })
				}
				// ========== KURS RASMI YUKLASH TUGADI ==========

				continue
			}
		}
  } catch (err) {
    if (isNavSignal(err)) {
      if (err.message === 'START') {
        await showStartMenu(ctx)
        return
      }
      if (err.message === 'ADMIN') {
        await replaceBotMessage(ctx, '👨‍💼 Siz allaqachon admin panelsiz.')
        return
      }
    }

    logger.error({ err }, 'Admin flow failed')
    await replaceBotMessage(ctx, '❌ Xatolik yuz berdi. Iltimos qaytadan urinib ko‘ring.')
  }
}