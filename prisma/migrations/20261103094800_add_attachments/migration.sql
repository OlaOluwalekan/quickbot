-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT', 'GENERATED_IMAGE', 'GENERATED_DOCUMENT', 'AVATAR', 'AUDIO');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'REJECTED', 'DELETED');

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "response_id" TEXT,
    "kind" "AttachmentKind" NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "provider_id" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "original_name" TEXT NOT NULL,
    "sha256" TEXT,
    "extracted_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_workspace_id_created_at_idx" ON "attachments"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "attachments_owner_id_idx" ON "attachments"("owner_id");

-- CreateIndex
CREATE INDEX "attachments_status_created_at_idx" ON "attachments"("status", "created_at");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
