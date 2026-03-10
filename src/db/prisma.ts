import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

import { PrismaClient } from '../generated/prisma/client'
import { logger } from '../utils/logger'

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined
	pgPool: Pool | undefined
}

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
	throw new Error('DATABASE_URL is not set')
}

const pool =
	globalForPrisma.pgPool ??
	new Pool({
		connectionString,
		max: 10,
		idleTimeoutMillis: 30_000,
		connectionTimeoutMillis: 10_000
	})

const adapter = new PrismaPg(pool)

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter: adapter as any,
		log: ['error', 'warn'],
		errorFormat: 'pretty'
	})

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma
	globalForPrisma.pgPool = pool
}

prisma
	.$connect()
	.then(() => logger.info('✅ Database connected successfully'))
	.catch((error: unknown) => {
		logger.error({ error }, '❌ Database connection failed')
		process.exit(1)
	})
