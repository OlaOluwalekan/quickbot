-- Enable pg_trgm extension for ILIKE and trigram search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on workspaces(title gin_trgm_ops)
CREATE INDEX IF NOT EXISTS "workspaces_title_trgm" ON "workspaces" USING gin ("title" gin_trgm_ops);
