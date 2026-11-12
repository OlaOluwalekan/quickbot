-- AlterEnum
ALTER TYPE "ResponseKind" ADD VALUE IF NOT EXISTS 'DOCUMENT';

-- AlterEnum
ALTER TYPE "ResponseOrigin" ADD VALUE IF NOT EXISTS 'UPLOAD';

-- AlterTable
ALTER TABLE "responses" ADD COLUMN "uploaded_attachment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "responses_uploaded_attachment_id_key" ON "responses"("uploaded_attachment_id");

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_uploaded_attachment_id_fkey" FOREIGN KEY ("uploaded_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
