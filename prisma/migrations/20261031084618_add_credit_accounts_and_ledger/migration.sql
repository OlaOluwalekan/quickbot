-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('GRANT', 'RESERVE', 'SETTLE', 'RELEASE', 'REFUND', 'EXPIRE', 'ADJUST');

-- CreateTable
CREATE TABLE "credit_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_balance" INTEGER NOT NULL DEFAULT 0,
    "topup_balance" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "plan_delta" INTEGER NOT NULL,
    "topup_delta" INTEGER NOT NULL,
    "plan_after" INTEGER NOT NULL,
    "topup_after" INTEGER NOT NULL,
    "generation_id" TEXT,
    "actor_id" TEXT,
    "reason" TEXT,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_accounts_user_id_key" ON "credit_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_ledger_idempotency_key_key" ON "credit_ledger"("idempotency_key");

-- CreateIndex
CREATE INDEX "credit_ledger_account_id_created_at_idx" ON "credit_ledger"("account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "credit_ledger_generation_id_idx" ON "credit_ledger"("generation_id");

-- AddForeignKey
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "credit_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Non-negative check constraint
ALTER TABLE credit_accounts ADD CONSTRAINT credit_accounts_nonneg CHECK (plan_balance >= 0 AND topup_balance >= 0);
