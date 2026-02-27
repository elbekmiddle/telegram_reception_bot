import { Context } from 'grammy';
import { env } from '../config/env';

export class TelegramHelper {
  static getFileUrl(ctx: Context, filePath: string): string {
    return `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${filePath}`;
  }

  static async downloadFile(ctx: Context, fileId: string): Promise<Buffer | null> {
    try {
      const file = await ctx.api.getFile(fileId);
      if (!file.file_path) {
        return null;
      }
      
      const url = this.getFileUrl(ctx, file.file_path);
      const response = await fetch(url);
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  static extractCallbackData(data: string): { prefix: string; action: string; id?: string; payload?: string } {
    const parts = data.split('|');
    return {
      prefix: parts[0],
      action: parts[1],
      id: parts[2],
      payload: parts[3],
    };
  }

  static isAdmin(chatId: number): boolean {
    const adminIds = [env.ADMIN_CHAT_ID];
    if (env.ADMIN_CHAT_ID_2) {
      adminIds.push(env.ADMIN_CHAT_ID_2);
    }
    return adminIds.includes(BigInt(chatId));
  }
}