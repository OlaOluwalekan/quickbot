-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "source_annotation_id" TEXT,
ADD COLUMN     "source_message_id" TEXT,
ADD COLUMN     "source_workspace_id" TEXT;

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "diagnostics" JSONB,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_email_created_at_idx" ON "support_tickets"("email", "created_at");

-- CreateIndex
CREATE INDEX "support_tickets_status_created_at_idx" ON "support_tickets"("status", "created_at");

-- CreateIndex
CREATE INDEX "workspaces_source_workspace_id_idx" ON "workspaces"("source_workspace_id");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
