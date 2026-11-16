-- AlterTable
ALTER TABLE "users" ADD COLUMN "welcome_email_sent_at" TIMESTAMP(3);

-- Existing verified users already use the app: mark them as welcomed so they
-- don't get a late welcome email. Users who haven't verified their email yet
-- keep NULL and get the welcome email when they verify.
UPDATE "users" SET "welcome_email_sent_at" = "createdAt" WHERE "emailVerified" = true;
