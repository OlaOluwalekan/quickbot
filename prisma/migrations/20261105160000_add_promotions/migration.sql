-- CreateEnum
CREATE TYPE "PromotionTarget" AS ENUM ('TIMELINE', 'NEW_WORKSPACE');

-- AlterTable
ALTER TABLE "responses" ADD COLUMN "quote" TEXT,
ADD COLUMN "source_annotation_id" TEXT;

-- AlterTable
ALTER TABLE "response_versions" ADD COLUMN "source_message_id" TEXT;

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "annotation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "target" "PromotionTarget" NOT NULL,
    "destination_response_id" TEXT,
    "destination_workspace_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "response_versions_source_message_id_idx" ON "response_versions"("source_message_id");

-- CreateIndex
CREATE INDEX "promotions_annotation_id_idx" ON "promotions"("annotation_id");

-- CreateIndex
CREATE INDEX "promotions_destination_response_id_idx" ON "promotions"("destination_response_id");

-- CreateIndex
CREATE INDEX "promotions_destination_workspace_id_idx" ON "promotions"("destination_workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_message_id_target_key" ON "promotions"("message_id", "target");

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "annotation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
