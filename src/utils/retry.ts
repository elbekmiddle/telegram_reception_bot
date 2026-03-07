import { logger } from './logger'

export async function withRetry<T>(
	fn: () => Promise<T>,
	options: {
		maxRetries?: number
		initialDelay?: number
		maxDelay?: number
		backoffFactor?: number
		retryableErrors?: Array<string | RegExp>
	} = {}
): Promise<T> {
	const {
		maxRetries = 3,
		initialDelay = 1000,
		maxDelay = 10000,
		backoffFactor = 2,
		retryableErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'socket hang up']
	} = options

	let lastError: Error
	let delay = initialDelay

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn()
		} catch (error) {
			lastError = error as Error

			// Check if error is retryable
			const isRetryable = retryableErrors.some(pattern => {
				if (typeof pattern === 'string') {
					return error?.code === pattern || error?.message?.includes(pattern)
				}
				return pattern.test(error?.message || '')
			})

			if (!isRetryable || attempt === maxRetries) {
				throw error
			}

			logger.warn(
				{
					err: error,
					attempt,
					maxRetries,
					delay
				},
				`API call failed, retrying in ${delay}ms`
			)

			await new Promise(resolve => setTimeout(resolve, delay))
			delay = Math.min(delay * backoffFactor, maxDelay)
		}
	}

	throw lastError!
}
