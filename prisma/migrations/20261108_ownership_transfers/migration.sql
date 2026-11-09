-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN IF NOT EXISTS "keep_active" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "project_members" ADD COLUMN IF NOT EXISTS "keep_active" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ownership_transfers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT,
    "project_id" TEXT,
    "from_user_id" TEXT NOT NULL,
    "to_user_id" TEXT NOT NULL,
    "previous_owner_action" TEXT NOT NULL DEFAULT 'STAY_ADMIN',
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ownership_transfers_target_check" CHECK (
        ("workspace_id" IS NOT NULL AND "project_id" IS NULL) OR
        ("workspace_id" IS NULL AND "project_id" IS NOT NULL)
    )
);

-- Partial unique indexes: one PENDING transfer per workspace/project
CREATE UNIQUE INDEX IF NOT EXISTS "ownership_transfers_pending_workspace_idx" 
  ON "ownership_transfers" ("workspace_id") 
  WHERE "status" = 'PENDING' AND "workspace_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "ownership_transfers_pending_project_idx" 
  ON "ownership_transfers" ("project_id") 
  WHERE "status" = 'PENDING' AND "project_id" IS NOT NULL;

-- Regular indexes
CREATE INDEX IF NOT EXISTS "ownership_transfers_to_user_id_status_idx" ON "ownership_transfers"("to_user_id", "status");
CREATE INDEX IF NOT EXISTS "ownership_transfers_workspace_id_idx" ON "ownership_transfers"("workspace_id");
CREATE INDEX IF NOT EXISTS "ownership_transfers_project_id_idx" ON "ownership_transfers"("project_id");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable MemberLimitGrace
CREATE TABLE IF NOT EXISTS "member_limit_grace" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "grace_ends_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_limit_grace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "member_limit_grace_owner_id_key" ON "member_limit_grace"("owner_id");

DO $$ BEGIN
  ALTER TABLE "member_limit_grace" ADD CONSTRAINT "member_limit_grace_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
