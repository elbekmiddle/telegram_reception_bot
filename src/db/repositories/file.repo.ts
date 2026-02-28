import { ApplicationFile, FileType, Prisma } from '@prisma/client'
import { prisma } from '../prisma'
import { logger } from '../../utils/logger'

export type SaveFileDTO = {
	applicationId: string
	type: FileType
	telegramFileId: string
	cloudinaryUrl?: string | null
	cloudinaryPublicId?: string | null
	meta?: Record<string, unknown>
}

export class FileRepository {
	async save(data: SaveFileDTO): Promise<ApplicationFile> {
		try {
			// meta ni Prisma.InputJsonValue ga aylantirish
			const metaValue = data.meta ? (data.meta as Prisma.InputJsonValue) : Prisma.JsonNull

			return await prisma.applicationFile.create({
				data: {
					applicationId: data.applicationId,
					type: data.type,
					telegramFileId: data.telegramFileId,
					cloudinaryUrl: data.cloudinaryUrl,
					cloudinaryPublicId: data.cloudinaryPublicId,
					meta: metaValue
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

	async getByType(applicationId: string, type: FileType): Promise<ApplicationFile | null> {
		try {
			return await prisma.applicationFile.findFirst({
				where: {
					applicationId,
					type
				}
			})
		} catch (error) {
			logger.error({ error, applicationId, type }, 'Error getting file by type')
			throw error
		}
	}

	async deleteByApplicationId(applicationId: string): Promise<void> {
		try {
			await prisma.applicationFile.deleteMany({
				where: { applicationId }
			})
		} catch (error) {
			logger.error({ error, applicationId }, 'Error deleting files')
			throw error
		}
	}
}

export const fileRepo = new FileRepository()
