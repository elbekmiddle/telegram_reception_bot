import { Pool, type PoolClient } from 'pg'
import { getEnv } from '../config/env'
import type { Queryable } from '../core/types'
import { logger } from '../utils/logger'
class Database implements Queryable {
  readonly pool: Pool
  constructor() {
    const env = getEnv()
    this.pool = new Pool({ connectionString: env.DATABASE_URL, max: env.PG_POOL_MAX, idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS, connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS, statement_timeout: env.PG_STATEMENT_TIMEOUT_MS, application_name:'telegram-reception-bot' })
    this.pool.on('error', (error: Error) => logger.error({ error }, 'postgres pool error'))
  }
  async query<T=unknown>(sql:string, params:unknown[] = []): Promise<{ rows:T[]; rowCount:number|null }> { const result = await this.pool.query(sql, params); return result as { rows:T[]; rowCount:number|null } }
  async tx<T>(fn:(client:PoolClient)=>Promise<T>): Promise<T> { const client = await this.pool.connect(); try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() } }
  async ping(): Promise<void> { await this.query('SELECT 1') }
  async close(): Promise<void> { await this.pool.end() }
}
export const db = new Database()
