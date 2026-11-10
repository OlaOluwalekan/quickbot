-- F2.3: a Klecx note belongs to the message that recorded it, so one comment
-- thread can hold several notes (the comment and each reply with @klecx).
-- `message_id` stays unique; `annotation_id` becomes a plain index.

-- DropIndex
DROP INDEX "workspace_notes_annotation_id_key";

-- CreateIndex
CREATE INDEX "workspace_notes_annotation_id_idx" ON "workspace_notes"("annotation_id");
