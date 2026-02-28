import Redis from 'ioredis'
import { env } from '../config/env'
import { logger } from '../utils/logger'
import type { SessionData } from '../types/session'

class RedisService {
	private client: Redis | null = null
	private readonly defaultTTL = 60 * 60 * 24 // 24 hours
	private isConnecting = false
	private reconnectAttempts = 0
	private readonly maxReconnectAttempts = 10

	constructor() {
		this.connect()
	}

	private connect() {
		if (this.client || this.isConnecting) return

		this.isConnecting = true

		try {
			this.client = new Redis({
				host: env.REDIS_HOST || 'localhost',
				port: parseInt(env.REDIS_PORT || '6379'),
				password: env.REDIS_PASSWORD,
				db: parseInt(env.REDIS_DB || '0'),
				retryStrategy: times => {
					if (times > this.maxReconnectAttempts) {
						logger.error(
							`Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`
						)
						return null
					}
					const delay = Math.min(times * 100, 3000)
					logger.info(
						`Retrying Redis connection in ${delay}ms... (attempt ${times}/${this.maxReconnectAttempts})`
					)
					return delay
				},
				maxRetriesPerRequest: 3,
				enableReadyCheck: true,
				lazyConnect: false,
				connectTimeout: 10000,
				commandTimeout: 5000,
				keepAlive: 30000,
				family: 4
			})

			this.client.on('connect', () => {
				logger.info('🔄 Redis connecting...')
			})

			this.client.on('ready', () => {
				this.isConnecting = false
				this.reconnectAttempts = 0
				logger.info('✅ Redis connected successfully')
			})

			this.client.on('error', (error: Error) => {
				logger.error(
					{ error: { message: error.message, code: (error as any).code } },
					'Redis connection error'
				)
				// Don't set isConnecting to false here, let retryStrategy handle it
			})

			this.client.on('close', () => {
				logger.warn('🔴 Redis connection closed')
				this.isConnecting = false
				this.client = null
			})

			this.client.on('reconnecting', () => {
				this.reconnectAttempts++
				logger.info(
					`🔄 Redis reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
				)
			})

			this.client.on('end', () => {
				logger.error('🔴 Redis connection ended')
				this.isConnecting = false
				this.client = null
			})
		} catch (error) {
			logger.error({ error }, 'Failed to create Redis client')
			this.isConnecting = false
			this.client = null
		}
	}

	private async ensureConnection(): Promise<boolean> {
		if (!this.client || this.client.status !== 'ready') {
			logger.warn('Redis not ready, attempting to reconnect...')
			this.connect()
			// Wait for connection
			for (let i = 0; i < 10; i++) {
				await new Promise(resolve => setTimeout(resolve, 500))
				if (this.client && this.client.status === 'ready') {
					return true
				}
			}
			return false
		}
		return true
	}

	async saveSession(
		telegramId: string,
		sessionData: SessionData,
		ttl: number = this.defaultTTL
	): Promise<boolean> {
		try {
			const connected = await this.ensureConnection()
			if (!connected || !this.client) {
				logger.warn({ telegramId }, 'Redis not connected, skipping session save')
				return false
			}

			const key = `session:${telegramId}`
			const result = await this.client.setex(key, ttl, JSON.stringify(sessionData))

			if (result === 'OK') {
				logger.debug({ telegramId }, 'Session saved to Redis')
				return true
			}
			return false
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to save session to Redis')
			return false
		}
	}

	async getSession(telegramId: string): Promise<SessionData | null> {
		try {
			const connected = await this.ensureConnection()
			if (!connected || !this.client) {
				logger.warn({ telegramId }, 'Redis not connected, skipping session get')
				return null
			}

			const key = `session:${telegramId}`
			const data = await this.client.get(key)

			if (data) {
				logger.debug({ telegramId }, 'Session retrieved from Redis')
				return JSON.parse(data) as SessionData
			}
			return null
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to get session from Redis')
			return null
		}
	}

	async deleteSession(telegramId: string): Promise<boolean> {
		try {
			const connected = await this.ensureConnection()
			if (!connected || !this.client) {
				logger.warn({ telegramId }, 'Redis not connected, skipping session delete')
				return false
			}

			const key = `session:${telegramId}`
			const result = await this.client.del(key)

			if (result > 0) {
				logger.debug({ telegramId }, 'Session deleted from Redis')
				return true
			}
			return false
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to delete session from Redis')
			return false
		}
	}

	async updateSession(telegramId: string, updates: Partial<SessionData>): Promise<boolean> {
		try {
			const connected = await this.ensureConnection()
			if (!connected || !this.client) {
				logger.warn({ telegramId }, 'Redis not connected, skipping session update')
				return false
			}

			const current = await this.getSession(telegramId)
			if (current) {
				const updated = { ...current, ...updates }
				return await this.saveSession(telegramId, updated)
			}
			return false
		} catch (error) {
			logger.error({ error, telegramId }, 'Failed to update session in Redis')
			return false
		}
	}

	async ping(): Promise<boolean> {
		try {
			const connected = await this.ensureConnection()
			if (!connected || !this.client) return false

			const result = await this.client.ping()
			return result === 'PONG'
		} catch {
			return false
		}
	}

	async quit(): Promise<void> {
		if (this.client) {
			try {
				await this.client.quit()
				logger.info('Redis connection closed gracefully')
			} catch (error) {
				logger.error({ error }, 'Error closing Redis connection')
			} finally {
				this.client = null
				this.isConnecting = false
			}
		}
	}
}

export const redisService = new RedisService()
