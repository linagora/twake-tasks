-- Forced row-level security would hide every row from the owner, so it is
-- lifted around the backfill.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = 'tasks'
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'description_text_checklists must run as the owner of tasks, or as a role that bypasses row-level security: % would see no rows and leave the checklist markers in place', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "tasks"
SET "description_text" = regexp_replace("description_text", '(^|\n)\[[ xX]\] ', '\1', 'g')
WHERE "description_text" ~ '(^|\n)\[[ xX]\] ';--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;
