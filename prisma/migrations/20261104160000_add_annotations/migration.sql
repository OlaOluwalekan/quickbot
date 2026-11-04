-- CreateEnum
CREATE TYPE "AnnotationKind" AS ENUM ('COMMENT', 'REPLY', 'QUESTION');

-- CreateEnum
CREATE TYPE "QuestionState" AS ENUM ('NONE', 'QUEUED', 'ANSWERING', 'ANSWERED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('ORIGINAL', 'EDIT');

-- CreateEnum
CREATE TYPE "MsgRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "content_source" "ContentSource" NOT NULL DEFAULT 'ORIGINAL',
    "edit_revision" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "kind" "AnnotationKind" NOT NULL,
    "question_state" "QuestionState" NOT NULL DEFAULT 'NONE',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "resolved_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "anchor_exact" TEXT NOT NULL,
    "anchor_prefix" TEXT NOT NULL,
    "anchor_suffix" TEXT NOT NULL,
    "anchor_start" INTEGER,
    "anchor_end" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotation_messages" (
    "id" TEXT NOT NULL,
    "annotation_id" TEXT NOT NULL,
    "role" "MsgRole" NOT NULL,
    "content" TEXT NOT NULL,
    "author_id" TEXT,
    "generation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annotations_version_id_deleted_at_idx" ON "annotations"("version_id", "deleted_at");

-- CreateIndex
CREATE INDEX "annotations_workspace_id_created_by_id_question_state_idx" ON "annotations"("workspace_id", "created_by_id", "question_state");

-- CreateIndex
CREATE INDEX "annotations_response_id_idx" ON "annotations"("response_id");

-- CreateIndex
CREATE UNIQUE INDEX "annotation_messages_generation_id_key" ON "annotation_messages"("generation_id");

-- CreateIndex
CREATE INDEX "annotation_messages_annotation_id_created_at_idx" ON "annotation_messages"("annotation_id", "created_at");

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "response_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_messages" ADD CONSTRAINT "annotation_messages_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotation_messages" ADD CONSTRAINT "annotation_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
