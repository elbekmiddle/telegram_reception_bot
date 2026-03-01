import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger'

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined
}

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		log: ['error', 'warn'],
		errorFormat: 'pretty'
	})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Test connection
prisma
	.$connect()
	.then(() => logger.info('✅ Database connected successfully'))
	.catch((error: unknown) => {
		logger.error('❌ Database connection failed:', error)
		process.exit(1)
	})
