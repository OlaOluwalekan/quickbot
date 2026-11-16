-- AlterTable
ALTER TABLE "users" ADD COLUMN "welcome_email_sent_at" TIMESTAMP(3);

-- Set welcome_email_sent_at for all existing users so they don't receive late welcome emails
UPDATE "users" SET "welcome_email_sent_at" = "createdAt";
