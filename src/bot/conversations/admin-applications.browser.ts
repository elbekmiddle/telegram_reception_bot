import type { Conversation } from '@grammyjs/conversations'
import { InlineKeyboard } from 'grammy'

import type { BotContext } from '../bot'
import { prisma } from '../../db/prisma'
import { escapeMarkdown, replaceBotMessage, deletePrevBotMessage } from './flow-helpers'
import { FileType } from '../../generated/prisma/client'
import { getUserLang } from '../../utils/i18n'

function adminText(ctx: BotContext, uz: string, ru: string): string {
  return getUserLang(ctx) === 'ru' ? ru : uz
}

function applicationStatusText(ctx: BotContext, status: string): string {
  if (status === 'APPROVED') return adminText(ctx, 'Qabul qilindi', 'Принята')
  if (status === 'REJECTED') return adminText(ctx, 'Rad etildi', 'Отклонена')
  if (status === 'IN_PROGRESS') return adminText(ctx, 'Ko‘rib chiqilmoqda', 'На рассмотрении')
  if (status === 'SUBMITTED') return adminText(ctx, 'Yuborilgan', 'Отправлена')
  return status
}

export async function manageApplicationsBrowser(
  conversation: Conversation<BotContext>,
  ctx: BotContext
): Promise<void> {
  while (true) {
    const vacancies = await prisma.vacancy.findMany({
      where: { applications: { some: {} } },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true } } }
    })

    if (!vacancies.length) {
      await ctx.reply(adminText(ctx, '📭 Hozircha arizalar yoʻq', '📭 Пока заявок нет'))
      return
    }

    let text = adminText(ctx, '📨 *Arizalar bo‘limi*\n\nAriza bor vakansiyani tanlang:', '📨 *Раздел заявок*\n\nВыберите вакансию, где есть заявки:')
    const kb = new InlineKeyboard()

    for (const vacancy of vacancies) {
      text += `\n\n• ${escapeMarkdown(vacancy.title)} — ${vacancy._count.applications}`
      kb.text(`${vacancy.title} (${vacancy._count.applications})`, `APPV|${vacancy.id}`).row()
    }

    kb.text(adminText(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'APPV|BACK')

    await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    await upd.answerCallbackQuery().catch(() => {})

    if (data === 'APPV|BACK') return
    if (!data.startsWith('APPV|')) continue

    await manageApplicationsForVacancy(conversation, ctx, data.split('|')[1])
  }
}

async function manageApplicationsForVacancy(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  vacancyId: string
): Promise<void> {
  while (true) {
    const applications = await prisma.application.findMany({
      where: { vacancyId, status: { in: ['SUBMITTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED'] } },
      orderBy: { createdAt: 'desc' },
      include: { answers: true, files: true, user: true, vacancy: true }
    })

    const vacancyTitle = applications[0]?.vacancy?.title || (await prisma.vacancy.findUnique({ where: { id: vacancyId }, select: { title: true } }))?.title || '—'

    let text = `📋 *${escapeMarkdown(vacancyTitle)}*\n\n`
    const kb = new InlineKeyboard()

    if (!applications.length) {
      text += adminText(ctx, 'Bu vakansiya uchun arizalar yoʻq.', 'По этой вакансии заявок нет.')
    } else {
      applications.slice(0, 20).forEach((app, idx) => {
        const answers = new Map<string, string>(app.answers.map(a => [a.fieldKey, a.fieldValue] as [string, string]))
        const fullName = answers.get('full_name') || [app.user?.firstName, app.user?.lastName].filter(Boolean).join(' ') || '—'
        const phone = answers.get('phone_number') || answers.get('phone') || '—'
        text += `${idx + 1}. ${escapeMarkdown(fullName)} — ${escapeMarkdown(phone)}\n`
        kb.text(`${idx + 1}. ${fullName}`, `APP|VIEW|${app.id}`).row()
      })
    }

    kb.text(adminText(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'APP|BACK')

    await replaceBotMessage(ctx, text, { parse_mode: 'Markdown', reply_markup: kb })
    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    await upd.answerCallbackQuery().catch(() => {})

    if (data === 'APP|BACK') return
    if (!data.startsWith('APP|VIEW|')) continue

    await viewAdminApplication(conversation, ctx, data.split('|')[2])
  }
}

async function viewAdminApplication(
  conversation: Conversation<BotContext>,
  ctx: BotContext,
  applicationId: string
): Promise<void> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { answers: true, files: true, user: true, vacancy: true }
  })

  if (!application) {
    await ctx.reply(adminText(ctx, '❌ Ariza topilmadi', '❌ Заявка не найдена'))
    return
  }

  const answers = new Map<string, string>(application.answers.map(a => [a.fieldKey, a.fieldValue] as [string, string]))
  const photoUrl = application.files.find(f => f.type === FileType.HALF_BODY)?.cloudinaryUrl || answers.get('photo')
  const caption = [
    `📝 *${escapeMarkdown(application.vacancy?.title || '—')}*`,
    `👤 *F\.I\.Sh:* ${escapeMarkdown(answers.get('full_name') || [application.user?.firstName, application.user?.lastName].filter(Boolean).join(' ') || '—')}`,
    `📞 *Telefon:* ${escapeMarkdown(answers.get('phone_number') || answers.get('phone') || '—')}`,
    `📍 *Holat:* ${escapeMarkdown(applicationStatusText(ctx, application.status))}`,
    `🗓 *Sana:* ${application.createdAt.toLocaleString('ru-RU')}`
  ].join('\n')

  const kb = new InlineKeyboard()
  if (application.status !== 'APPROVED') {
    kb.text(adminText(ctx, '✅ Qabul qilish', '✅ Принять'), `AD|APPROVE|${application.id}`)
  }
  if (application.status !== 'APPROVED' && application.status !== 'IN_PROGRESS') {
    kb.text(adminText(ctx, '👀 Koʻrib chiqish', '👀 На рассмотрение'), `AD|REVIEW|${application.id}`)
  }
  if (application.status !== 'REJECTED') {
    kb.row().text(adminText(ctx, '❌ Rad qilish', '❌ Отклонить'), `AD|REJECT|${application.id}`)
  }
  kb.row().text(adminText(ctx, '⬅️ Orqaga', '⬅️ Назад'), 'APPD|BACK')

  await deletePrevBotMessage(ctx)
  if (photoUrl) {
    const sent = await ctx.replyWithPhoto(photoUrl, { caption, parse_mode: 'Markdown', reply_markup: kb })
    ctx.session.lastBotMessageId = sent.message_id
  } else {
    await replaceBotMessage(ctx, caption, { parse_mode: 'Markdown', reply_markup: kb })
  }

  while (true) {
    const upd = await conversation.wait()
    const data = upd.callbackQuery?.data
    if (!data) continue
    await upd.answerCallbackQuery().catch(() => {})
    if (data === 'APPD|BACK') return
    if (data.startsWith('AD|')) return
  }
}
