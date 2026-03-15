import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { env } from '../config/env'
import { logger } from '../utils/logger'

const globalPg = globalThis as unknown as { pgPool?: Pool }

export const pgPool =
	globalPg.pgPool ??
	new Pool({
		connectionString: env.DATABASE_URL,
		max: env.PG_POOL_MAX,
		min: env.PG_POOL_MIN,
		idleTimeoutMillis: env.PG_IDLE_TIMEOUT_MS,
		connectionTimeoutMillis: env.PG_CONNECTION_TIMEOUT_MS,
		allowExitOnIdle: false,
		maxUses: env.PG_POOL_MAX_USES
	})

if (env.NODE_ENV !== 'production') {
	globalPg.pgPool = pgPool
}

pgPool.on('error', err => {
	logger.error({ err }, 'Unexpected postgres pool error')
})

export async function query<T extends QueryResultRow>(
	text: string,
	params: unknown[] = [],
	timeoutMs: number = env.PG_QUERY_TIMEOUT_MS
): Promise<QueryResult<T>> {
	const client = await pgPool.connect()
	try {
		await client.query(`SET LOCAL statement_timeout = ${Math.max(1, timeoutMs)}`)
		return await client.query<T>(text, params)
	} finally {
		client.release()
	}
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pgPool.connect()
	try {
		await client.query('BEGIN')
		await client.query(`SET LOCAL statement_timeout = ${Math.max(1, env.PG_QUERY_TIMEOUT_MS)}`)
		const result = await fn(client)
		await client.query('COMMIT')
		return result
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	} finally {
		client.release()
	}
}
