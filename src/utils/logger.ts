import pino from 'pino'
import { env } from '../config/env'

const transport =
	env.NODE_ENV === 'development'
		? pino.transport({
				target: 'pino-pretty',
				options: {
					colorize: true,
					translateTime: 'SYS:standard',
					ignore: 'pid,hostname'
				}
		  })
		: undefined

export const logger = pino(
	{
		level: env.LOG_LEVEL,
		base: undefined,
		formatters: {
			level: label => ({ level: label })
		}
	},
	transport
)

export function normalizeError(err: unknown): Record<string, unknown> {
	if (err instanceof Error) {
		return { name: err.name, message: err.message, stack: err.stack }
	}
	return { value: err }
}
