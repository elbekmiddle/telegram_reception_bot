import { createServer } from 'node:http'
import { getEnv } from '../config/env'
import { db } from '../db/sql'
import { createBot } from '../bot/app'
import { createHttpServer } from '../http/server'
import { logger } from '../utils/logger'
export async function startApp(): Promise<{ stop:()=>Promise<void> }> { const env=getEnv(); await db.ping(); const bot=createBot(db); const server=createServer(createHttpServer(bot)); await bot.init(); if(env.useWebhook){ if(!env.PUBLIC_BASE_URL) throw new Error('PUBLIC_BASE_URL is required when USE_WEBHOOK=true'); await bot.api.setWebhook(`${env.PUBLIC_BASE_URL}/webhook/${env.WEBHOOK_SECRET}`, { drop_pending_updates:false }) } else { await bot.api.deleteWebhook({ drop_pending_updates:false }).catch(() => undefined); await bot.start({ drop_pending_updates:false }) } await new Promise<void>(resolve => server.listen(env.PORT, resolve)); logger.info({ port:env.PORT }, 'http server started'); return { stop: async () => { if(!env.useWebhook) await bot.stop(); await new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())); await db.close() } } }
