-- CreateEnum
CREATE TYPE "AnnotationTarget" AS ENUM ('RESPONSE_VERSION', 'ANNOTATION_MESSAGE', 'DOCUMENT_REVISION');

-- CreateEnum
CREATE TYPE "AuthorType" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "SuggestionState" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- Step 1: Migrate AnnotationKind enum (COMMENT, REPLY, QUESTION -> COMMENT, ASK)
CREATE TYPE "AnnotationKind_new" AS ENUM ('COMMENT', 'ASK');

-- Update former replies question_state before kind change:
-- Questions keep their question_state; former replies get question_state = 'ANSWERED' if they have an ASSISTANT message, else 'FAILED'.
UPDATE "annotations" a
SET "question_state" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "annotation_messages" am
    WHERE am."annotation_id" = a."id" AND am."role" = 'ASSISTANT'
  ) THEN 'ANSWERED'::"QuestionState"
  ELSE 'FAILED'::"QuestionState"
END
WHERE a."kind" = 'REPLY';

ALTER TABLE "annotations"
  ALTER COLUMN "kind" TYPE "AnnotationKind_new"
  USING (
    CASE
      WHEN "kind"::text IN ('REPLY', 'QUESTION') THEN 'ASK'::"AnnotationKind_new"
      ELSE "kind"::text::"AnnotationKind_new"
    END
  );

DROP TYPE "AnnotationKind";
ALTER TYPE "AnnotationKind_new" RENAME TO "AnnotationKind";

-- Step 2: Alter table annotations (nullable response_id, version_id + new columns)
ALTER TABLE "annotations" ALTER COLUMN "response_id" DROP NOT NULL;
ALTER TABLE "annotations" ALTER COLUMN "version_id" DROP NOT NULL;

ALTER TABLE "annotations"
  ADD COLUMN "target_type" "AnnotationTarget" NOT NULL DEFAULT 'RESPONSE_VERSION',
  ADD COLUMN "target_message_id" TEXT,
  ADD COLUMN "document_id" TEXT,
  ADD COLUMN "document_revision" INTEGER,
  ADD COLUMN "parent_annotation_id" TEXT,
  ADD COLUMN "root_annotation_id" TEXT,
  ADD COLUMN "depth" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "author_type" "AuthorType" NOT NULL DEFAULT 'USER',
  ADD COLUMN "suggestion" JSONB,
  ADD COLUMN "suggestion_state" "SuggestionState";

-- Step 3: Foreign keys and indexes on annotations
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_target_message_id_fkey" FOREIGN KEY ("target_message_id") REFERENCES "annotation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_parent_annotation_id_fkey" FOREIGN KEY ("parent_annotation_id") REFERENCES "annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "annotations_target_message_id_deleted_at_idx" ON "annotations"("target_message_id", "deleted_at");
CREATE INDEX "annotations_root_annotation_id_idx" ON "annotations"("root_annotation_id");

-- Step 4: CHECK constraints on annotations
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_one_target" CHECK (
  (target_type = 'RESPONSE_VERSION'   AND version_id IS NOT NULL AND target_message_id IS NULL AND document_id IS NULL)
  OR (target_type = 'ANNOTATION_MESSAGE' AND target_message_id IS NOT NULL AND version_id IS NULL AND document_id IS NULL)
  OR (target_type = 'DOCUMENT_REVISION'  AND document_id IS NOT NULL AND document_revision IS NOT NULL AND version_id IS NULL AND target_message_id IS NULL)
);

ALTER TABLE "annotations" ADD CONSTRAINT "annotations_depth_nonnegative" CHECK (depth >= 0);

-- Step 5: Alter table annotation_messages
ALTER TABLE "annotation_messages"
  ADD COLUMN "thought_summary" TEXT,
  ADD COLUMN "citations" JSONB,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETE',
  ADD COLUMN "model_key" TEXT;

-- Step 6: Create table annotation_mentions
CREATE TABLE "annotation_mentions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT,
    "is_klecx" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotation_mentions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "annotation_mentions_message_id_user_id_key" ON "annotation_mentions"("message_id", "user_id");
CREATE INDEX "annotation_mentions_user_id_created_at_idx" ON "annotation_mentions"("user_id", "created_at");

ALTER TABLE "annotation_mentions" ADD CONSTRAINT "annotation_mentions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "annotation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "annotation_mentions" ADD CONSTRAINT "annotation_mentions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Create table workspace_notes
CREATE TABLE "workspace_notes" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "annotation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "workspace_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_notes_annotation_id_key" ON "workspace_notes"("annotation_id");
CREATE UNIQUE INDEX "workspace_notes_message_id_key" ON "workspace_notes"("message_id");
CREATE INDEX "workspace_notes_workspace_id_status_created_at_idx" ON "workspace_notes"("workspace_id", "status", "created_at");

ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_annotation_id_fkey" FOREIGN KEY ("annotation_id") REFERENCES "annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
