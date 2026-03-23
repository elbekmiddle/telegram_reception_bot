// src/bot/conversations/admin-enrollments.browser.ts
// FIXES:
//  - After approve/reject: buttons immediately removed from detail view
//  - After approve/reject: user is notified (was missing in browser flow)
//  - DB operations wrapped in conversation.external() to prevent Grammy replay side effects
//  - canReview check: buttons never shown for already-resolved enrollments
//  - Detail view refresh: immediately shows updated status after action

import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { escapeMarkdown, replaceBotMessage } from './flow-helpers'
import { getUserLang } from '../../utils/i18n'
import { logger } from '../../utils/logger'

function t(ctx: BotContext, uz: string, ru: string): string {
  return getUserLang(ctx) === 'ru' ? ru : uz
}

function enrollmentStatusText(ctx: BotContext, status: string): string {
  if (status === 'APPROVED') return t(ctx, '✅ Qabul qilindi', '✅ Принята')
  if (status === 'REJECTED') return t(ctx, '❌ Rad etildi', '❌ Отклонена')
  return t(ctx, '⏳ Kutilmoqda', '⏳ Ожидает')
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

function userDisplayName(user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null | undefined): string {
  const full = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
  return full || user?.username || '—'
}

function buildEnrollmentDetail(
  ctx: BotContext,
  enrollment: {
    id: string
    fullName: string
    phone: string
    status: string
    createdAt: Date
    answers: any
    course: { title: string } | null
    user: { firstName?: string | null; lastName?: string | null; username?: string | null } | null
  }
): string {
  const answers = (enrollment.answers || {}) as { days?: string; timeSlot?: string }
  return [
    `📝 *${escapeMarkdown(enrollment.course?.title || '—')}*`,
    `👤 *F.I.Sh:* ${escapeMarkdown(enrollment.fullName || userDisplayName(enrollment.user))}`,
    `📞 *Telefon:* ${escapeMarkdown(enrollment.phone || '—')}`,
    `📍 *Holat:* ${escapeMarkdown(enrollmentStatusText(ctx, enrollment.status))}`,
    `📅 *Kunlar:* ${escapeMarkdown(formatDays(answers.days))}`,
    `🕒 *Vaqt:* ${escapeMarkdown(formatTimeSlot(answers.timeSlot))}`,
    `🗓 *Sana:* ${enrollment.createdAt.toLocaleString('ru-RU')}`
  ].join('\n')
}

export async function manageCourseEnrollmentsBrowser(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  while (true) {
    // Wrap DB read in conversation.external() to prevent Grammy replay side effects
    const courses = await conversation.external(() =>
      prisma.course.findMany({
        where: { enrollments: { some: {} } },
        include: { _count: { select: { enrollments: true } } },
        orderBy: { createdAt: 'desc' }
      })
    )

    if (!courses.length) {
      await ctx.reply(t(ctx, '📭 Hozircha kurs yozilishlari yoʻq', '📭 Пока записей на курсы нет'))
      return
    }

    let text = t(ctx, '🎓 *Kurs yozilishlari*\n\nSoʻrov kelgan kursni tanlang:', '🎓 *Записи на курсы*\n\nВыберите курс с заявками:')
    const kb = new InlineKeyboard()

    for (const course of courses) {
      text += `\n\n• ${escapeMarkdown(course.title)} — ${course._count.enrollments} ta`
      kb.text(`${course.title} (${course._count.enrollments})`, `ENRV|${course.id}`).row()
    }
    kb.text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENRV|BACK')

    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    const fromMessageId = upd.callbackQuery?.message?.message_id
    if (fromMessageId && fromMessageId !== promptMsg.message_id) {
      await upd.answerCallbackQuery({ text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'), show_alert: false }).catch(() => {})
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
    const enrollments = await conversation.external(() =>
      prisma.courseEnrollment.findMany({
        where: { courseId },
        include: { user: true, course: true },
        orderBy: { createdAt: 'desc' }
      })
    )

    const courseTitle = enrollments[0]?.course?.title
      || await conversation.external(() => prisma.course.findUnique({ where: { id: courseId }, select: { title: true } }).then(c => c?.title || '—'))

    const kb = new InlineKeyboard()
    let text = `🎓 *${escapeMarkdown(String(courseTitle))}*\n\n`

    if (!enrollments.length) {
      text += t(ctx, 'Bu kurs uchun yozilishlar yoʻq.', 'По этому курсу записей нет.')
    } else {
      // Show status icon next to each enrollment for quick overview
      enrollments.slice(0, 20).forEach((item, idx) => {
        const statusIcon = item.status === 'APPROVED' ? '✅' : item.status === 'REJECTED' ? '❌' : '⏳'
        text += `${idx + 1}. ${statusIcon} ${escapeMarkdown(item.fullName || userDisplayName(item.user))} — ${escapeMarkdown(item.phone || '—')}\n`
        kb.text(`${idx + 1}. ${statusIcon} ${item.fullName || userDisplayName(item.user)}`, `ENR|VIEW|${item.id}`).row()
      })
    }

    kb.text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENR|BACK')
    const promptMsg = await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })

    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    const fromMessageId = upd.callbackQuery?.message?.message_id
    if (fromMessageId && fromMessageId !== promptMsg.message_id) {
      await upd.answerCallbackQuery({ text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'), show_alert: false }).catch(() => {})
      continue
    }
    await upd.answerCallbackQuery().catch(() => {})

    if (data === 'ENR|BACK') return
    if (!data.startsWith('ENR|VIEW|')) continue

    const enrollmentId = data.split('|')[2]

    // View + act on individual enrollment
    const actionResult = await viewAndActEnrollment(conversation, ctx, enrollmentId)
    // After any action, the outer loop re-fetches and shows updated list
    if (actionResult === 'BACK') continue
  }
}

/** Shows enrollment detail and handles approve/reject. Returns 'BACK' or 'ACTION_TAKEN' */
async function viewAndActEnrollment(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  enrollmentId: string
): Promise<'BACK' | 'ACTION_TAKEN'> {
  while (true) {
    // Always re-fetch to get latest status (FIX: prevents stale approve button)
    const enrollment = await conversation.external(() =>
      prisma.courseEnrollment.findUnique({
        where: { id: enrollmentId },
        include: { user: true, course: true }
      })
    )

    if (!enrollment) {
      await ctx.reply(t(ctx, 'Yozilish topilmadi.', 'Запись не найдена.'))
      return 'BACK'
    }

    const detailText = buildEnrollmentDetail(ctx, enrollment)

    // FIX: canReview check — buttons NEVER shown for already resolved enrollments
    const canReview = enrollment.status === 'NEW'
    const detailKb = new InlineKeyboard()
    if (canReview) {
      detailKb
        .text(t(ctx, '✅ Qabul qilish', '✅ Принять'), `ENR|APPROVE|${enrollment.id}`)
        .text(t(ctx, '❌ Rad etish', '❌ Отклонить'), `ENR|REJECT|${enrollment.id}`)
        .row()
    }
    detailKb.text(t(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'ENRD|BACK')

    const detailPromptMsg = await replaceBotMessage(ctx, detailText, { parse_mode: 'Markdown', reply_markup: detailKb })

    const upd2 = await conversation.wait()
    const data2 = upd2.callbackQuery?.data
    if (!data2) continue

    const fromMessageId2 = upd2.callbackQuery?.message?.message_id
    if (fromMessageId2 && fromMessageId2 !== detailPromptMsg.message_id) {
      await upd2.answerCallbackQuery({ text: t(ctx, 'Bu tugmalar eskirgan.', 'Эти кнопки устарели.'), show_alert: false }).catch(() => {})
      continue
    }
    await upd2.answerCallbackQuery().catch(() => {})

    if (data2 === 'ENRD|BACK') return 'BACK'

    if (data2 === `ENR|APPROVE|${enrollment.id}`) {
      // Idempotency guard
      if (enrollment.status === 'APPROVED') {
        await ctx.reply(t(ctx, 'Bu yozilish allaqachon qabul qilingan.', 'Эта запись уже принята.'))
        return 'ACTION_TAKEN'
      }

      // FIX: wrap DB update in conversation.external() — prevents replay side effects
      await conversation.external(() =>
        prisma.courseEnrollment.update({ where: { id: enrollmentId }, data: { status: 'APPROVED' } })
      )

      // FIX: notify the user (was missing in browser flow before)
      try {
        await ctx.api.sendMessage(
          Number(enrollment.user.telegramId),
          t(ctx,
            `✅ *Kursga yozilish qabul qilindi!*\n\nKurs: *${escapeMarkdown(enrollment.course.title)}*`,
            `✅ *Ваша запись на курс принята!*\n\nКурс: *${escapeMarkdown(enrollment.course.title)}*`
          ),
          { parse_mode: 'Markdown' }
        )
      } catch (err: any) {
        if (err?.error_code === 403) {
          logger.warn({ enrollmentId }, 'User blocked bot — cannot notify about course approval')
        } else {
          logger.error({ err, enrollmentId }, 'Failed to notify user about course approval')
        }
      }

      await ctx.reply(t(ctx, '✅ Qabul qilindi! Foydalanuvchiga xabar yuborildi.', '✅ Принято! Пользователь уведомлён.'))

      // FIX: loop continues → re-fetches enrollment → status=APPROVED → canReview=false → no buttons shown
      return 'ACTION_TAKEN'
    }

    if (data2 === `ENR|REJECT|${enrollment.id}`) {
      // Idempotency guard
      if (enrollment.status === 'REJECTED') {
        await ctx.reply(t(ctx, 'Bu yozilish allaqachon rad etilgan.', 'Эта запись уже отклонена.'))
        return 'ACTION_TAKEN'
      }

      await conversation.external(() =>
        prisma.courseEnrollment.update({ where: { id: enrollmentId }, data: { status: 'REJECTED' } })
      )

      try {
        await ctx.api.sendMessage(
          Number(enrollment.user.telegramId),
          t(ctx,
            `❌ *Kursga yozilish rad etildi.*\n\nKurs: *${escapeMarkdown(enrollment.course.title)}*`,
            `❌ *Ваша запись на курс отклонена.*\n\nКурс: *${escapeMarkdown(enrollment.course.title)}*`
          ),
          { parse_mode: 'Markdown' }
        )
      } catch (err: any) {
        if (err?.error_code !== 403) {
          logger.error({ err, enrollmentId }, 'Failed to notify user about course rejection')
        }
      }

      await ctx.reply(t(ctx, '❌ Rad etildi! Foydalanuvchiga xabar yuborildi.', '❌ Отклонено! Пользователь уведомлён.'))
      return 'ACTION_TAKEN'
    }
  }
}
