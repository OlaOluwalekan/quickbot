-- AlterTable
ALTER TABLE "project_members" ADD COLUMN "monthly_credit_cap" INTEGER DEFAULT 300;

-- AlterTable
ALTER TABLE "workspace_members" ADD COLUMN "monthly_credit_cap" INTEGER DEFAULT 300;

-- CreateIndex
CREATE INDEX "generations_billed_account_id_actor_id_created_at_idx" ON "generations"("billed_account_id", "actor_id", "created_at");
