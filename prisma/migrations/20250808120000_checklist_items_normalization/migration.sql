-- Enable required extension for UUID generation (safe if already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create checklist_items table
CREATE TABLE IF NOT EXISTS "checklist_items" (
  "id" TEXT PRIMARY KEY,
  "content" TEXT NOT NULL,
  "checked" BOOLEAN NOT NULL DEFAULT FALSE,
  "order" INTEGER NOT NULL DEFAULT 0,
  "noteId" TEXT NOT NULL,
  "slackMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- FK to notes
ALTER TABLE "checklist_items"
  ADD CONSTRAINT "checklist_items_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "notes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from JSON column notes.checklistItems when present
DO $$
DECLARE
  r RECORD;
  itm JSONB;
  idx INT;
  gen_id TEXT;
  c TEXT;
  ch BOOLEAN;
  ord INT;
BEGIN
  FOR r IN SELECT id, "checklistItems" FROM notes WHERE "checklistItems" IS NOT NULL LOOP
    idx := 0;
    FOR itm IN SELECT * FROM jsonb_array_elements(r."checklistItems") LOOP
      gen_id := COALESCE(itm->>'id', gen_random_uuid()::TEXT);
      c := COALESCE(itm->>'content', '');
      ch := COALESCE((itm->>'checked')::BOOLEAN, FALSE);
      ord := COALESCE((itm->>'order')::INT, idx);
      INSERT INTO "checklist_items" ("id", "content", "checked", "order", "noteId", "createdAt", "updatedAt")
      VALUES (gen_id, c, ch, ord, r.id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
      idx := idx + 1;
    END LOOP;
  END LOOP;
END$$;

-- Drop old JSON column
ALTER TABLE "notes" DROP COLUMN IF EXISTS "checklistItems";

-- Add index for noteId to improve query performance
CREATE INDEX idx_checklist_items_noteId ON "checklist_items"("noteId");

