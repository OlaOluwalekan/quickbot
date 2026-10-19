-- CreateEnum
CREATE TYPE "ResponseType" AS ENUM ('TEXT', 'IMAGE');

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "interactionId" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "type" "ResponseType" NOT NULL DEFAULT 'TEXT';
