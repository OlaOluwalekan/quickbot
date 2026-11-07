-- CreateEnum
CREATE TYPE "ShareScope" AS ENUM ('WORKSPACE', 'RESPONSE');

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "response_id" TEXT,
    "scope" "ShareScope" NOT NULL,
    "view" TEXT NOT NULL DEFAULT 'EDITED_IF_AVAILABLE',
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "show_author" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_viewed_at" TIMESTAMP(3),

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "share_links_scope_response_check" CHECK (
      ("scope" = 'WORKSPACE' AND "response_id" IS NULL) OR
      ("scope" = 'RESPONSE' AND "response_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_workspace_id_idx" ON "share_links"("workspace_id");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
