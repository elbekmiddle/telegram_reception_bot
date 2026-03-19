import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { escapeMarkdown, replaceBotMessage } from './flow-helpers'
import { getUserLang } from '../../utils/i18n'

function t(ctx: BotContext, uz: string, ru: string): string {
  return getUserLang(ctx) === 'ru' ? ru : uz
}

function enrollmentStatusText(ctx: BotContext, status: string): string {
  if (status === 'APPROVED') return t(ctx, 'Qabul qilindi', 'Принята')
  if (status === 'REJECTED') return t(ctx, 'Rad etildi', 'Отклонена')
  if (status === 'PENDING' || status === 'SUBMITTED') return t(ctx, 'Kutilmoqda', 'Ожидает')
  return status
}

function formatDays(value?: string | null): string {
  const map: Record<string, string> = {
    MON_WED: 'Dushanba / Chorshanba',
    TUE_THU: 'Seshanba / Payshanba',
    SAT_SUN: 'Shanba / Yakshanba'
  }
  return map[value || ''] || value || '—'
}

function formatTimeSlot(value?: string | null): string {
  const map: Record<string, string> = {
    '9_11': '09:00 - 11:00',
    '2_4': '14:00 - 16:00',
    '4_6': '16:00 - 18:00'
  }
  return map[value || ''] || value || '—'
}

export async function manageCourseEnrollmentsBrowser(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  while (true) {
    const courses = await prisma.course.findMany({
      where: { enrollments: { some: {} } },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { createdAt: 'desc' }
    })

    if (!courses.length) {
      await ctx.reply(t(ctx, '📭 Hozircha kurs yozilishlari yoʻq', '📭 Пока записей на курсы нет'))
      return
    }

    let text = t(ctx, '🎓 *Kurs yozilishlari*\n\nSoʻrov kelgan kursni tanlang:', '🎓 *Записи на курсы*\n\nВыберите курс с заявками:')
    const kb = new InlineKeyboard()

    for (const course of courses) {
      text += `\n\n• ${escapeMarkdown(course.title)} — ${course._count.enrollments}`
      kb.text(`${course.title} (${course._count.enrollments})`, `ENRV|${course.id}`).row()
    }

    kb.text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENRV|BACK')

    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    const fromMessageId = upd.callbackQuery?.message?.message_id
    if (fromMessageId && fromMessageId !== promptMsg.message_id) {
      await upd.answerCallbackQuery({
        text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'),
        show_alert: false
      }).catch(() => {})
      continue
    }
    await upd.answerCallbackQuery().catch(() => {})

    if (data === 'ENRV|BACK') return
    if (!data.startsWith('ENRV|')) continue

    await manageEnrollmentsForCourse(conversation, ctx, data.split('|')[1])
  }
}

async function manageEnrollmentsForCourse(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  courseId: string
): Promise<void> {
  while (true) {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { courseId },
      include: { user: true, course: true },
      orderBy: { createdAt: 'desc' }
    })

    const courseTitle = enrollments[0]?.course?.title || (await prisma.course.findUnique({ where: { id: courseId }, select: { title: true } }))?.title || '—'
    let text = `🎓 *${escapeMarkdown(courseTitle)}*\n\n`
    const kb = new InlineKeyboard()

    if (!enrollments.length) {
      text += t(ctx, 'Bu kurs uchun yozilishlar yoʻq.', 'По этому курсу записей нет.')
    } else {
      enrollments.slice(0, 20).forEach((item, idx) => {
        text += `${idx + 1}. ${escapeMarkdown(item.fullName || userDisplayName(item.user))} — ${escapeMarkdown(item.phone || '—')}\n`
        kb.text(`${idx + 1}. ${item.fullName || userDisplayName(item.user)}`, `ENR|VIEW|${item.id}`).row()
      })
    }

    kb.text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENR|BACK')
    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    const fromMessageId = upd.callbackQuery?.message?.message_id
    if (fromMessageId && fromMessageId !== promptMsg.message_id) {
      await upd.answerCallbackQuery({
        text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'),
        show_alert: false
      }).catch(() => {})
      continue
    }
    await upd.answerCallbackQuery().catch(() => {})

    if (data === 'ENR|BACK') return
    if (!data.startsWith('ENR|VIEW|')) continue

    const enrollmentId = data.split('|')[2]
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { id: enrollmentId },
      include: { user: true, course: true }
    })
    if (!enrollment) continue

    const answers = (enrollment.answers || {}) as { days?: string; timeSlot?: string }
    const detail = [
      `📝 *${escapeMarkdown(enrollment.course?.title || '—')}*`,
      `👤 *F.I.Sh:* ${escapeMarkdown(enrollment.fullName || userDisplayName(enrollment.user))}`,
      `📞 *Telefon:* ${escapeMarkdown(enrollment.phone || '—')}`,
      `📍 *Holat:* ${escapeMarkdown(enrollmentStatusText(ctx, enrollment.status))}`,
      `📅 *Kunlar:* ${escapeMarkdown(formatDays(answers.days))}`,
      `🕒 *Vaqt:* ${escapeMarkdown(formatTimeSlot(answers.timeSlot))}`,
      `🗓 *Sana:* ${enrollment.createdAt.toLocaleString('ru-RU')}`
    ].join('\n')

    const canReview = enrollment.status !== 'APPROVED' && enrollment.status !== 'REJECTED'
    const detailKb = new InlineKeyboard()
    if (canReview) {
      detailKb.text(t(ctx, '✅ Qabul qilish', '✅ Принять'), `CE|APPROVE|${enrollment.id}`)
    }
    if (canReview) {
      detailKb.text(t(ctx, '❌ Rad etish', '❌ Отклонить'), `CE|REJECT|${enrollment.id}`)
    }
    detailKb.row().text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENRD|BACK')

    const detailPromptMsg = await replaceBotMessage(ctx, detail, { parse_mode: 'Markdown', reply_markup: detailKb })
    
    while (true) {
      const upd2 = await conversation.wait()
      const data2 = upd2.callbackQuery?.data
      if (!data2) continue
      const fromMessageId2 = upd2.callbackQuery?.message?.message_id
      if (fromMessageId2 && fromMessageId2 !== detailPromptMsg.message_id) {
        await upd2.answerCallbackQuery({
          text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'),
          show_alert: false
        }).catch(() => {})
        continue
      }
      await upd2.answerCallbackQuery().catch(() => {})
      
      if (data2 === 'ENRD|BACK') break
      
      if (data2.startsWith('CE|APPROVE|')) {
        const enrollmentId2 = data2.split('|')[2]
        await prisma.courseEnrollment.update({
          where: { id: enrollmentId2 },
          data: { status: 'APPROVED' }
        })
        await ctx.reply(t(ctx, '✅ Ariza qabul qilindi!', '✅ Заявка принята!'))
        await conversation.sleep(500)
        break
      }
      
      if (data2.startsWith('CE|REJECT|')) {
        const enrollmentId2 = data2.split('|')[2]
        await prisma.courseEnrollment.update({
          where: { id: enrollmentId2 },
          data: { status: 'REJECTED' }
        })
        await ctx.reply(t(ctx, '❌ Ariza rad etildi!', '❌ Заявка отклонена!'))
        await conversation.sleep(500)
        break
      }
    }
  }
}

function userDisplayName(user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined): string {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return full || user?.username || '—'
}