-- CreateEnum
CREATE TYPE "CitationSource" AS ENUM ('GROUNDING', 'ATTACHMENT', 'MODEL_PROVIDED');

-- CreateTable
CREATE TABLE "citations" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "source" "CitationSource" NOT NULL DEFAULT 'GROUNDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "citations_version_id_idx" ON "citations"("version_id");

-- CreateIndex
CREATE UNIQUE INDEX "citations_version_id_index_key" ON "citations"("version_id", "index");

-- AddForeignKey
ALTER TABLE "citations" ADD CONSTRAINT "citations_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "response_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
