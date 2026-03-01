-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('HALF_BODY', 'PASSPORT', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "AnswerFieldType" AS ENUM ('TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'DATE', 'PHONE');

-- CreateEnum
CREATE TYPE "CourseLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'IELTS', 'TOEFL', 'OTHER');

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "current_step" TEXT,
    "vacancy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" BIGINT,
    "rejection_reason" TEXT,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" "CourseLevel" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_answers" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_value" TEXT NOT NULL,
    "field_type" "AnswerFieldType" NOT NULL DEFAULT 'TEXT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_files" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "type" "FileType" NOT NULL,
    "telegram_file_id" TEXT NOT NULL,
    "cloudinary_url" TEXT,
    "cloudinary_public_id" TEXT,
    "meta" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "applications_telegram_id_idx" ON "applications"("telegram_id");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_telegram_id_status_idx" ON "applications"("telegram_id", "status");

-- CreateIndex
CREATE INDEX "vacancies_is_active_idx" ON "vacancies"("is_active");

-- CreateIndex
CREATE INDEX "courses_is_active_idx" ON "courses"("is_active");

-- CreateIndex
CREATE INDEX "application_answers_application_id_idx" ON "application_answers"("application_id");

-- CreateIndex
CREATE INDEX "application_answers_field_key_idx" ON "application_answers"("field_key");

-- CreateIndex
CREATE UNIQUE INDEX "application_answers_application_id_field_key_key" ON "application_answers"("application_id", "field_key");

-- CreateIndex
CREATE INDEX "application_files_application_id_idx" ON "application_files"("application_id");

-- CreateIndex
CREATE INDEX "application_files_type_idx" ON "application_files"("type");

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_answers" ADD CONSTRAINT "application_answers_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_files" ADD CONSTRAINT "application_files_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
