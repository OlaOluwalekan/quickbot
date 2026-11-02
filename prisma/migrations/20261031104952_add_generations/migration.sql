-- CreateEnum
CREATE TYPE "GenStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GenKind" AS ENUM ('TEXT', 'IMAGE', 'ANNOTATION_REPLY', 'QUESTION_BATCH', 'TITLE', 'SPEECH');

-- CreateTable
CREATE TABLE "generations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "response_id" TEXT,
    "version_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "billed_account_id" TEXT NOT NULL,
    "kind" "GenKind" NOT NULL,
    "status" "GenStatus" NOT NULL DEFAULT 'QUEUED',
    "model_key" TEXT NOT NULL,
    "provider_model_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "reserved_credits" INTEGER NOT NULL DEFAULT 0,
    "charged_credits" INTEGER NOT NULL DEFAULT 0,
    "usage" JSONB,
    "error_code" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generations_workspace_id_created_at_idx" ON "generations"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "generations_status_started_at_idx" ON "generations"("status", "started_at");

-- CreateIndex
CREATE INDEX "generations_billed_account_id_created_at_idx" ON "generations"("billed_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generations_actor_id_idempotency_key_key" ON "generations"("actor_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "generations" ADD CONSTRAINT "generations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
