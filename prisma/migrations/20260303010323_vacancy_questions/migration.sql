/*
  Warnings:

  - You are about to drop the column `questions` on the `vacancies` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "vacancies" DROP COLUMN "questions";

-- CreateTable
CREATE TABLE "vacancy_questions" (
    "id" TEXT NOT NULL,
    "vacancy_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "field_type" "AnswerFieldType" NOT NULL DEFAULT 'TEXT',
    "options" JSONB DEFAULT '{}',
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacancy_questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vacancy_questions_vacancy_id_idx" ON "vacancy_questions"("vacancy_id");

-- CreateIndex
CREATE UNIQUE INDEX "vacancy_questions_vacancy_id_key_key" ON "vacancy_questions"("vacancy_id", "key");

-- AddForeignKey
ALTER TABLE "vacancy_questions" ADD CONSTRAINT "vacancy_questions_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
