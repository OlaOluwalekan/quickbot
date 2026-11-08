-- Step 1: Delete any rows that used the removed 'NONE' role
DELETE FROM "workspace_members" WHERE "role"::text = 'NONE';

-- Step 2: Alter enum type to remove 'NONE'
CREATE TYPE "WorkspaceRole_new" AS ENUM ('VIEWER', 'COMMENTER', 'EDITOR', 'ADMIN');
ALTER TABLE "workspace_members" ALTER COLUMN "role" TYPE "WorkspaceRole_new" USING ("role"::text::"WorkspaceRole_new");
DROP TYPE "WorkspaceRole";
ALTER TYPE "WorkspaceRole_new" RENAME TO "WorkspaceRole";
