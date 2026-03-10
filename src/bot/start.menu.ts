import { InlineKeyboard } from 'grammy'
import type { BotContext } from './bot'
import { logger } from '../utils/logger'
import { userService } from '../services/user.service'
import { deletePrevBotMessage } from './conversations/flow-helpers'
import { prisma } from '../db/prisma'
import { runtimeSettingsService } from '../services/runtime-settings.service'
import { applicationStatusLabel, getUserLang, setUserLang, t, type AppLang } from '../utils/i18n'
import { escapeMarkdown } from './conversations/flow-helpers'

function isAdminUser(userId?: number): boolean {
	const admins = [process.env.ADMIN_CHAT_ID, process.env.ADMIN_CHAT_ID_2]
		.map(v => Number(v || 0))
		.filter(Boolean)
	return Boolean(userId && admins.includes(userId))
}

async function replaceBotMessage(ctx: BotContext, text: string, kb?: InlineKeyboard) {
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb })
	ctx.session.lastBotMessageId = sent.message_id
	return sent
}

async function exitAllConversations(ctx: BotContext): Promise<void> {
	try {
		const actives = await ctx.conversation.active()
		for (const name of Object.keys(actives)) {
			try {
				await ctx.conversation.exit(name)
			} catch {
				// ignore
			}
		}
	} catch {
		// ignore
	}
}


async function enterConversationSafe(ctx: BotContext, name: 'applicationFlow' | 'courseFlow' | 'adminFlow'): Promise<boolean> {
	try {
		ctx.session.flowActive = false
		ctx.session.flowState = { step: 'idle', data: {} }
		ctx.session.applicationId = undefined
		ctx.session.currentStep = undefined
		ctx.session.history = []
		ctx.session.temp = { answers: {}, language: ctx.session.temp?.language } as any
		await exitAllConversations(ctx)
		await deletePrevBotMessage(ctx)
		await new Promise(resolve => setTimeout(resolve, 100))
		const controls: any = ctx.conversation as any
		if (!controls || typeof controls.enter !== 'function') {
			throw new Error('Conversation controls unavailable')
		}
		await controls.enter(name)
		return true
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id, conversation: name }, 'enterConversationSafe failed')
		const fallbackText = name === 'applicationFlow'
			? (getUserLang(ctx) === 'ru' ? 'Вакансии пока не добавлены.' : 'Hali vakansiya qoʻshilmagan.')
			: name === 'courseFlow'
				? (getUserLang(ctx) === 'ru' ? 'Курсы пока не добавлены.' : 'Hali kurs qoʻshilmagan.')
				: (getUserLang(ctx) === 'ru' ? 'Не удалось открыть этот раздел. Нажмите /start и попробуйте снова.' : 'Bu bo‘limni ochib bo‘lmadi. /start ni bosib qayta urinib ko‘ring.')
		await replaceBotMessage(ctx, fallbackText)
		return false
	}
}

function buildStartKeyboard(ctx: BotContext): InlineKeyboard {
	const kb = new InlineKeyboard()
	kb.text(t(ctx, 'courses'), 'START|COURSE').text(t(ctx, 'vacancies'), 'START|VAC').row()
	kb.text(t(ctx, 'myApplications'), 'START|APPS').text(t(ctx, 'about'), 'START|ABOUT').row()
	kb.text(t(ctx, 'contact'), 'START|CONTACT').text(t(ctx, 'blog'), 'START|BLOG').row()
	kb.text(t(ctx, 'language'), 'START|LANG')
	if (isAdminUser(ctx.from?.id)) kb.row().text(t(ctx, 'admin'), 'START|ADMIN')
	return kb
}

export async function showStartMenu(ctx: BotContext): Promise<void> {
	try {
		await userService.upsertFromCtx(ctx)
		getUserLang(ctx)
		ctx.session.flowActive = false
		ctx.session.flowState = { step: 'idle' }
		await exitAllConversations(ctx)
		await replaceBotMessage(ctx, t(ctx, 'menuText'), buildStartKeyboard(ctx))
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'showStartMenu failed')
		await ctx.reply("Xatolik yuz berdi. Qayta urinib ko'ring.")
	}
}

async function showLanguagePicker(ctx: BotContext): Promise<void> {
	const kb = new InlineKeyboard()
		.text('🇺🇿 O‘zbekcha', 'LANG|uz')
		.row()
		.text('🇷🇺 Русский', 'LANG|ru')
		.row()
		.text(t(ctx, 'backMain'), 'START|BACK_MAIN')
	await replaceBotMessage(ctx, t(ctx, 'langTitle'), kb)
}

async function showAbout(ctx: BotContext): Promise<void> {
	const settings = runtimeSettingsService.get()
	const kb = new InlineKeyboard().text(t(ctx, 'backMain'), 'START|BACK_MAIN')
	const extra = settings.aboutText || process.env.ABOUT_TEXT
	const text = extra ? `${t(ctx, 'aboutText')}\n\n${extra}` : t(ctx, 'aboutText')
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, { reply_markup: kb, link_preview_options: { is_disabled: false } })
	ctx.session.lastBotMessageId = sent.message_id
}

async function showContact(ctx: BotContext): Promise<void> {
	const settings = runtimeSettingsService.get()
	const telegram = process.env.CONTACT_TELEGRAM || '@your_center'
	const phone = process.env.CONTACT_PHONE || '+998 00 000 00 00'
	const extra = settings.contactText || process.env.CONTACT_TEXT
	const lines = [
		t(ctx, 'contactTitle'),
		'',
		`• *${t(ctx, 'contactTelegram')}:* ${escapeMarkdown(telegram)}`,
		`• *${t(ctx, 'contactPhone')}:* ${escapeMarkdown(phone)}`
	]
	if (extra) lines.push('', extra)
	const kb = new InlineKeyboard().text(t(ctx, 'backMain'), 'START|BACK_MAIN')
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: kb, link_preview_options: { is_disabled: false } })
	ctx.session.lastBotMessageId = sent.message_id
}

async function showBlog(ctx: BotContext): Promise<void> {
	const settings = runtimeSettingsService.get()
	const kb = new InlineKeyboard().text(t(ctx, 'backMain'), 'START|BACK_MAIN')
	let text = `${t(ctx, 'blogTitle')}\n\n${getUserLang(ctx) === 'ru' ? 'Ссылка пока не указана.' : 'Havola hozircha kiritilmagan.'}`
	if (settings.instagramUrl) {
		text = `${t(ctx, 'blogTitle')}\n\n${settings.instagramUrl}`
	}
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text, { reply_markup: kb, link_preview_options: { is_disabled: false } })
	ctx.session.lastBotMessageId = sent.message_id
}

async function showMyApplications(ctx: BotContext): Promise<void> {
	const telegramId = ctx.from?.id
	if (!telegramId) return
	const applications = await prisma.application.findMany({
		where: { telegramId: BigInt(telegramId) },
		orderBy: { createdAt: 'desc' },
		include: { vacancy: true }
	})
	const kb = new InlineKeyboard().text(t(ctx, 'backMain'), 'START|BACK_MAIN')
	if (!applications.length) {
		await replaceBotMessage(ctx, `${t(ctx, 'applicationsTitle')}\n\n${t(ctx, 'applicationsEmpty')}`, kb)
		return
	}
	const text = [t(ctx, 'applicationsTitle').replace(/\*/g, ''), '']
	for (const app of applications.slice(0, 10)) {
		text.push(
			`• ${app.vacancy?.title || '—'}`,
			`  ${applicationStatusLabel(ctx, app.status)}`,
			`  ${app.createdAt.toLocaleString('ru-RU')}`
		)
	}
	await deletePrevBotMessage(ctx)
	const sent = await ctx.reply(text.join('\n'), { reply_markup: kb })
	ctx.session.lastBotMessageId = sent.message_id
}

export async function handleStartChoice(ctx: BotContext): Promise<void> {
	try {
		try {
			await ctx.answerCallbackQuery()
		} catch {
			// ignore
		}

		const data = ctx.callbackQuery?.data
		if (!data) return

		if (data.startsWith('LANG|')) {
			const lang = data.split('|')[1] as AppLang
			setUserLang(ctx, lang === 'ru' ? 'ru' : 'uz')
			await replaceBotMessage(
				ctx,
				lang === 'ru' ? t(ctx, 'langChangedRu') : t(ctx, 'langChangedUz'),
				buildStartKeyboard(ctx)
			)
			return
		}

		if (data === 'START|VAC' || data === 'user_vacancies') {
			await enterConversationSafe(ctx, 'applicationFlow')
			return
		}
		if (data === 'START|COURSE' || data === 'user_courses') {
			await enterConversationSafe(ctx, 'courseFlow')
			return
		}
		if (data === 'START|ADMIN') {
			if (!isAdminUser(ctx.from?.id)) {
				await replaceBotMessage(ctx, 'Bu bo‘lim faqat adminlar uchun.')
				return
			}
			await enterConversationSafe(ctx, 'adminFlow')
			return
		}
		if (data === 'START|BACK_MAIN' || data === 'user_back_main') {
			await showStartMenu(ctx)
			return
		}
		if (data === 'START|LANG') {
			await showLanguagePicker(ctx)
			return
		}
		if (data === 'START|ABOUT') {
			await showAbout(ctx)
			return
		}
		if (data === 'START|CONTACT') {
			await showContact(ctx)
			return
		}
		if (data === 'START|BLOG') {
			await showBlog(ctx)
			return
		}
		if (data === 'START|APPS') {
			await showMyApplications(ctx)
			return
		}
	} catch (err) {
		logger.error({ err, userId: ctx.from?.id }, 'handleStartChoice failed')
		await replaceBotMessage(ctx, "Xatolik yuz berdi. /start bilan qayta urinib ko'ring.")
	}
}
