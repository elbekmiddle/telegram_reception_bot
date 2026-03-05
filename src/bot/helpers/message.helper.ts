import type { BotContext } from '../bot'

export async function deletePreviousMessage(ctx: BotContext): Promise<void> {
  const msgId = ctx.session.lastBotMessageId
  const chatId = ctx.chat?.id
  if (!msgId || !chatId) return

  try {
    await ctx.api.deleteMessage(chatId, msgId)
  } catch (error) {
    // Ignore - message might be already deleted
  }
}

export async function replaceBotMessage(
  ctx: BotContext,
  text: string,
  options?: Parameters<BotContext['reply']>[1]
): Promise<ReturnType<BotContext['reply']>> {
  await deletePreviousMessage(ctx)
  const sent = await ctx.reply(text, options)
  ctx.session.lastBotMessageId = sent.message_id
  return sent
}