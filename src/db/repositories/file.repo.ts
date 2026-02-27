import { ApplicationFile } from '@prisma/client'
import { prisma } from '../prisma'
import { SaveFileDTO } from '../../types/domain'
import { logger } from '../../utils/logger'

export class FileRepository {
	async save(data: SaveFileDTO): Promise<ApplicationFile> {
		try {
			return await prisma.applicationFile.create({
				data: {
					applicationId: data.applicationId,
					type: data.type,
					telegramFileId: data.telegramFileId,
					meta: data.meta || {}
				}
			})
		} catch (error) {
			logger.error({ error, data }, 'Error saving file')
			throw error
		}
	}

	async getByApplicationId(applicationId: string): Promise<ApplicationFile[]> {
		try {
			return await prisma.applicationFile.findMany({
				where: { applicationId },
				orderBy: { createdAt: 'asc' }
			})
		} catch (error) {
			logger.error({ error, applicationId }, 'Error getting files by application ID')
			throw error
		}
	}

	async getByType(applicationId: string, type: string): Promise<ApplicationFile | null> {
		try {
			return await prisma.applicationFile.findFirst({
				where: {
					applicationId,
					type: type as any
				}
			})
		} catch (error) {
			logger.error({ error, applicationId, type }, 'Error getting file by type')
			throw error
		}
	}
}

export const fileRepo = new FileRepository()
