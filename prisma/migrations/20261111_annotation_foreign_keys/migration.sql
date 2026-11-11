-- F2.6: foreign keys that were missing since F2.1 / F2.3, so deleting a
-- message, a user or a root annotation no longer leaves dangling ids.
--   workspace_notes.message_id        -> annotation_messages (the note goes with its message)
--   workspace_notes.created_by_id     -> users (the note outlives its author's account)
--   annotations.root_annotation_id    -> annotations (a thread goes with its root)

-- AlterTable
ALTER TABLE "workspace_notes" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- Clean up rows that already point at something deleted, or the constraints can't be added.
DELETE FROM "workspace_notes" n
WHERE NOT EXISTS (SELECT 1 FROM "annotation_messages" m WHERE m."id" = n."message_id");

UPDATE "workspace_notes" n SET "created_by_id" = NULL
WHERE n."created_by_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "users" u WHERE u."id" = n."created_by_id");

UPDATE "annotations" a SET "root_annotation_id" = NULL
WHERE a."root_annotation_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "annotations" r WHERE r."id" = a."root_annotation_id");

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_root_annotation_id_fkey" FOREIGN KEY ("root_annotation_id") REFERENCES "annotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "annotation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
