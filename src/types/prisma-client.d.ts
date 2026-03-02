// NOTE: This file exists to make `npm run build` work even when Prisma Client
// is not generated yet (e.g., CI without Prisma engines).
// In production you should run `npx prisma generate` which will provide real types.

declare module '@prisma/client' {
  // ===== Enums (as runtime objects + union types) =====
  export const ApplicationStatus: {
    NEW: 'NEW'
    IN_PROGRESS: 'IN_PROGRESS'
    SUBMITTED: 'SUBMITTED'
    APPROVED: 'APPROVED'
    REJECTED: 'REJECTED'
    CANCELLED: 'CANCELLED'
    [k: string]: string
  }
  export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus] | string

  export const FileType: {
    HALF_BODY: 'HALF_BODY'
    PASSPORT: 'PASSPORT'
    RECOMMENDATION: 'RECOMMENDATION'
    [k: string]: string
  }
  export type FileType = (typeof FileType)[keyof typeof FileType] | string

  export const AnswerFieldType: {
    TEXT: 'TEXT'
    SINGLE_CHOICE: 'SINGLE_CHOICE'
    MULTI_CHOICE: 'MULTI_CHOICE'
    DATE: 'DATE'
    PHONE: 'PHONE'
    [k: string]: string
  }
  export type AnswerFieldType = (typeof AnswerFieldType)[keyof typeof AnswerFieldType] | string

  // ===== Models =====
  export interface Application {
    id: string
    telegramId: bigint
    status: ApplicationStatus
    currentStep: string
    vacancyId?: string | null
    createdAt: Date
    updatedAt: Date
    submittedAt?: Date | null
    reviewedAt?: Date | null
    reviewedBy?: bigint | null
    rejectionReason?: string | null
    answers?: ApplicationAnswer[]
    files?: ApplicationFile[]
    vacancy?: any | null
  }

  export namespace Prisma {
    export type ApplicationWhereInput = Record<string, any>
  }

  export interface ApplicationAnswer {
    id: string
    applicationId: string
    fieldKey: string
    fieldValue: string
    fieldType: AnswerFieldType
    createdAt: Date
    updatedAt?: Date
  }

  export interface ApplicationFile {
    id: string
    applicationId: string
    type: FileType
    telegramFileId?: string | null
    cloudinaryUrl?: string | null
    cloudinaryPublicId?: string | null
    meta?: any
    createdAt: Date
    updatedAt?: Date
  }

  // Minimal PrismaClient typing for compilation. Runtime comes from real Prisma Client.
  export class PrismaClient {
    [key: string]: any
    constructor(...args: any[])
  }
}
