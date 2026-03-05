-- AlterTable: Remove old vacancy fields
ALTER TABLE "vacancies" DROP COLUMN IF EXISTS "description";
ALTER TABLE "vacancies" DROP COLUMN IF EXISTS "salary_from";
ALTER TABLE "vacancies" DROP COLUMN IF EXISTS "salary_to";
ALTER TABLE "vacancies" ADD COLUMN IF NOT EXISTS "salary" TEXT;

-- Drop old vacancy_questions structure if exists
DROP TABLE IF EXISTS "vacancy_questions" CASCADE;

-- Create new QuestionType enum
DO $$ BEGIN
 CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'SINGLE_SELECT', 'MULTI_SELECT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- Create new vacancy_questions table
CREATE TABLE IF NOT EXISTS "vacancy_questions" (
    "id" TEXT NOT NULL,
    "vacancy_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vacancy_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vacancy_questions_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vacancy_questions_vacancy_id_idx" ON "vacancy_questions"("vacancy_id");

-- Create question_options table for vacancy questions
CREATE TABLE IF NOT EXISTS "question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "vacancy_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "question_options_question_id_idx" ON "question_options"("question_id");

-- AlterTable: Update courses
ALTER TABLE "courses" DROP COLUMN IF EXISTS "level";
ALTER TABLE "courses" DROP COLUMN IF EXISTS "has_certificate";
ALTER TABLE "courses" DROP COLUMN IF EXISTS "price";
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "price" TEXT;

-- Create course_questions table
CREATE TABLE IF NOT EXISTS "course_questions" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TEXT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "course_questions_course_id_idx" ON "course_questions"("course_id");

-- Create course_question_options table
CREATE TABLE IF NOT EXISTS "course_question_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "course_question_options_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "course_questions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "course_question_options_question_id_idx" ON "course_question_options"("question_id");

-- AlterTable: Update course_enrollments
ALTER TABLE "course_enrollments" DROP COLUMN IF EXISTS "days";
ALTER TABLE "course_enrollments" DROP COLUMN IF EXISTS "time_slot";
ALTER TABLE "course_enrollments" DROP COLUMN IF EXISTS "want_certificate";
ALTER TABLE "course_enrollments" ADD COLUMN IF NOT EXISTS "photo_file_id" TEXT;
ALTER TABLE "course_enrollments" ADD COLUMN IF NOT EXISTS "answers" JSONB NOT NULL DEFAULT '{}';

-- Drop unused enum
DROP TYPE IF EXISTS "CourseLevel";
