import type { Queryable } from '../../core/types'
export async function getRuntimeSetting(db:Queryable, key:string): Promise<string|null> { const result = await db.query<{ value:string }>(`SELECT value FROM runtime_settings WHERE key=$1 LIMIT 1`, [key]); return result.rows[0]?.value ?? null }
