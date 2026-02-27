import 'dotenv/config'
import { startBot } from './bot/bot'
import { logger } from './utils/logger'

process.on('uncaughtException', error => {
	logger.fatal({ error }, 'Uncaught Exception')
	process.exit(1)
})

process.on('unhandledRejection', reason => {
	logger.fatal({ reason }, 'Unhandled Rejection')
	process.exit(1)
})

async function main() {
	try {
		logger.info('🚀 Starting bot...')
		await startBot()
	} catch (error) {
		logger.fatal({ error }, 'Failed to start bot')
		process.exit(1)
	}
}

main()
