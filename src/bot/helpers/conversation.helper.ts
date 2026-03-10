import type { BotContext } from "../bot"

export async function hasActiveConversations(ctx: BotContext): Promise<boolean> {
	if (ctx.session?.flowActive) return true
	if (ctx.session?.currentStep) return true
	try {
		const active = await ctx.conversation.active()
		if (Array.isArray(active)) return active.length > 0
		if (active && typeof active === 'object') return Object.keys(active).length > 0
		return false
	} catch {
		return Boolean(ctx.session?.flowActive || ctx.session?.currentStep)
	}
}
