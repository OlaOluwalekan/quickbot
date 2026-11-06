-- AlterTable
ALTER TABLE "users" ADD COLUMN "avatar_attachment_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_attachment_id_key" ON "users"("avatar_attachment_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_attachment_id_fkey" FOREIGN KEY ("avatar_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
