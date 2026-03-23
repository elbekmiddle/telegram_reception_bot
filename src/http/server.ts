import express from 'express'
import type { Bot } from 'grammy'
import type { AppContext } from '../core/types'
import { getEnv } from '../config/env'
import { db } from '../db/sql'
import { getCache } from '../infra/redis/client'
import { registry, webhookLatency } from '../utils/metrics'
import { logger } from '../utils/logger'
export function createHttpServer(bot:Bot<AppContext>) { const env=getEnv(); const app=express(); app.use(express.json({ limit:'2mb' })); app.get('/live', (_req,res) => { res.status(200).json({ status:'alive', ts:new Date().toISOString() }) }); app.get('/ready', async (_req,res) => { try { await db.ping(); await getCache().ping(); res.status(200).json({ status:'ready' }) } catch (error) { res.status(503).json({ status:'not_ready', error:String(error) }) } }); app.get('/health', (_req,res) => { res.status(200).json({ uptime:process.uptime(), memory:process.memoryUsage(), env:env.NODE_ENV }) }); app.get('/metrics', async (_req,res) => { res.setHeader('content-type', registry.contentType); res.send(await registry.metrics()) }); app.post(`/webhook/${env.WEBHOOK_SECRET}`, async (req,res) => { const end=webhookLatency.startTimer(); try { await bot.handleUpdate(req.body); res.sendStatus(200) } catch (error) { logger.error({ error }, 'webhook update failed'); res.sendStatus(500) } finally { end() } }); app.use((_req,res) => { res.status(404).json({ error:'not_found' }) }); return app }
