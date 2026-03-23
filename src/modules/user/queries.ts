import type { Lang, Queryable, UserRecord } from '../../core/types'
import { detectLang } from '../../core/i18n'
import { shouldSyncUser } from '../../infra/redis/stores'
export async function upsertUser(db:Queryable, telegramUser:{ id:number; first_name?:string; last_name?:string; username?:string; language_code?:string }): Promise<UserRecord> {
  const preferredLang = detectLang(telegramUser.language_code)
  const result = await db.query<UserRecord>(`INSERT INTO users (telegram_id, first_name, last_name, username, language_code, last_seen_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (telegram_id) DO UPDATE SET first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, username=EXCLUDED.username, last_seen_at=NOW(), updated_at=NOW() RETURNING id, telegram_id::text AS "telegramId", first_name AS "firstName", last_name AS "lastName", username, language_code AS "languageCode"`, [telegramUser.id, telegramUser.first_name ?? null, telegramUser.last_name ?? null, telegramUser.username ?? null, preferredLang])
  return result.rows[0]
}
export async function getUserByTelegramId(db:Queryable, telegramId:number): Promise<UserRecord|null> { const result = await db.query<UserRecord>(`SELECT id, telegram_id::text AS "telegramId", first_name AS "firstName", last_name AS "lastName", username, language_code AS "languageCode" FROM users WHERE telegram_id=$1 LIMIT 1`, [telegramId]); return result.rows[0] ?? null }
export async function touchUserIfNeeded(db:Queryable, telegramUser:{ id:number; first_name?:string; last_name?:string; username?:string; language_code?:string }): Promise<UserRecord> { if(await shouldSyncUser(telegramUser.id)) return upsertUser(db, telegramUser); return (await getUserByTelegramId(db, telegramUser.id)) ?? upsertUser(db, telegramUser) }
export async function updateUserLanguage(db:Queryable, telegramId:number, lang:Lang): Promise<void> { await db.query(`UPDATE users SET language_code=$2, updated_at=NOW() WHERE telegram_id=$1`, [telegramId, lang]) }
