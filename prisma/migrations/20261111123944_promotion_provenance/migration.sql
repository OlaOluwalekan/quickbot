-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "source_annotation_id" TEXT,
ADD COLUMN     "source_message_id" TEXT,
ADD COLUMN     "source_workspace_id" TEXT;

-- CreateIndex
CREATE INDEX "workspaces_source_workspace_id_idx" ON "workspaces"("source_workspace_id");
