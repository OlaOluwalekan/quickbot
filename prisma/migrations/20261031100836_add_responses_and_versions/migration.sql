-- CreateEnum
CREATE TYPE "ResponseKind" AS ENUM ('TEXT', 'IMAGE');

-- CreateEnum
CREATE TYPE "ResponseOrigin" AS ENUM ('DIRECT', 'PROMOTED');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('STREAMING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "responses" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "kind" "ResponseKind" NOT NULL DEFAULT 'TEXT',
    "origin" "ResponseOrigin" NOT NULL DEFAULT 'DIRECT',
    "sort_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active_version_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_versions" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'STREAMING',
    "content" TEXT NOT NULL DEFAULT '',
    "thought_summary" TEXT,
    "model_key" TEXT NOT NULL,
    "provider_model_id" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "generation_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "response_edits" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "editor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "response_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "responses_active_version_id_key" ON "responses"("active_version_id");

-- CreateIndex
CREATE INDEX "responses_workspace_id_deleted_at_sort_at_id_idx" ON "responses"("workspace_id", "deleted_at", "sort_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "response_versions_generation_id_key" ON "response_versions"("generation_id");

-- CreateIndex
CREATE INDEX "response_versions_response_id_created_at_idx" ON "response_versions"("response_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "response_versions_response_id_number_key" ON "response_versions"("response_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "response_edits_version_id_revision_key" ON "response_edits"("version_id", "revision");

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_versions" ADD CONSTRAINT "response_versions_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "response_edits" ADD CONSTRAINT "response_edits_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "response_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
