-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "country" TEXT,
ADD COLUMN "deviceLabel" TEXT,
ADD COLUMN "client" TEXT DEFAULT 'web';
