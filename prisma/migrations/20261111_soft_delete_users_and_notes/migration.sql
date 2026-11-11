-- F2.6 (owner decision, 2026-11-11): deleting an account is a soft delete.
-- The `users` row stays with `deleted_at` set, and the Klecx notes that
-- person wrote are soft-deleted too (`workspace_notes.deleted_at`).
--
-- So a note always has an author again: `created_by_id` goes back to
-- NOT NULL (20261111_annotation_foreign_keys had made it nullable with
-- ON DELETE SET NULL). The foreign key now cascades, which only matters if a
-- user row is ever removed for good.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workspace_notes" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Notes whose author row no longer exists can't keep an author.
DELETE FROM "workspace_notes" WHERE "created_by_id" IS NULL;

-- DropForeignKey
ALTER TABLE "workspace_notes" DROP CONSTRAINT "workspace_notes_created_by_id_fkey";

-- AlterTable
ALTER TABLE "workspace_notes" ALTER COLUMN "created_by_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "workspace_notes" ADD CONSTRAINT "workspace_notes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
