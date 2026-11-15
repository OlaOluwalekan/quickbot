-- AlterEnum
ALTER TYPE "GenKind" ADD VALUE IF NOT EXISTS 'TRANSCRIPTION';

-- AlterTable
ALTER TABLE "generations" ALTER COLUMN "workspace_id" DROP NOT NULL;
