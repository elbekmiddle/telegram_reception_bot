import { getEnv } from '../../config/env'
import { getCache } from './client'
export async function allowRateLimit(userId:number): Promise<boolean> { const env=getEnv(); const count = await getCache().incr(`rate:${userId}`, env.RATE_LIMIT_WINDOW_SEC); return count <= env.RATE_LIMIT_MAX }
export async function shouldSyncUser(userId:number): Promise<boolean> { const env=getEnv(); const key=`sync:${userId}`; const hit=await getCache().get(key); if(hit) return false; await getCache().set(key,'1', env.USER_SYNC_TTL_SEC); return true }
export async function dedupeCallback(callbackId:string): Promise<boolean> { const env=getEnv(); const key=`cb:${callbackId}`; const hit=await getCache().get(key); if(hit) return false; await getCache().set(key,'1', env.CALLBACK_DEDUPE_TTL_SEC); return true }
