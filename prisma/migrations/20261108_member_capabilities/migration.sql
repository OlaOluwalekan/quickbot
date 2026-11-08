-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN "can_comment" BOOLEAN,
ADD COLUMN "can_ask" BOOLEAN,
ADD COLUMN "suspended_at" TIMESTAMP(3),
ADD COLUMN "suspended_reason" TEXT;

-- AlterTable
ALTER TABLE "project_members" ADD COLUMN "can_comment" BOOLEAN,
ADD COLUMN "can_ask" BOOLEAN,
ADD COLUMN "suspended_at" TIMESTAMP(3),
ADD COLUMN "suspended_reason" TEXT;
