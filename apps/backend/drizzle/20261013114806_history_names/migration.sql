ALTER TABLE "task_history" ADD COLUMN "name" text;--> statement-breakpoint
-- A section or label entry keeps the name of what it points to, so it still
-- reads after that section is deleted or the task moves to another project.
CREATE OR REPLACE FUNCTION log_task_change(task uuid, org text, field text, old jsonb, new jsonb) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO task_history (task_id, org_id, actor_id, actor_email, field, "from", "to", name)
  VALUES (
    task, org,
    nullif(current_setting('app.user_id', true), '')::uuid,
    coalesce(current_setting('app.user_email', true), ''),
    field, old, new,
    CASE field
      WHEN 'section' THEN (SELECT name FROM sections WHERE id = (new #>> '{}')::uuid)
      WHEN 'labels' THEN (SELECT name FROM labels WHERE id = (coalesce(new, old) #>> '{}')::uuid)
    END
  )
$$;--> statement-breakpoint
-- Forced row-level security would hide every row from the owner, so it is
-- lifted around the backfill. Entries of sections already deleted stay unnamed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('task_history', 'sections', 'labels')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'history_names must run as the owner of task_history, sections and labels, or as a role that bypasses row-level security: % would see no rows and leave the history unnamed', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_history" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "task_history" h SET "name" = s."name"
FROM "sections" s
WHERE h."field" = 'section' AND s."id" = (h."to" #>> '{}')::uuid;--> statement-breakpoint
UPDATE "task_history" h SET "name" = l."name"
FROM "labels" l
WHERE h."field" = 'labels' AND l."id" = (coalesce(h."to", h."from") #>> '{}')::uuid;--> statement-breakpoint
ALTER TABLE "task_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels" FORCE ROW LEVEL SECURITY;
