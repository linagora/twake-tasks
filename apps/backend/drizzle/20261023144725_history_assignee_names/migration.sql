-- An assignee entry keeps the person's name too, so it still reads once the
-- task moves to a project they are not a member of.
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
      WHEN 'assignees' THEN (
        SELECT coalesce(us.name, pm.name, pm.email)
        FROM project_members pm
        LEFT JOIN user_settings us ON us.email = lower(pm.email)
        WHERE pm.user_id = (coalesce(new, old) #>> '{}')::uuid
        ORDER BY pm.project_id IS NOT DISTINCT FROM (
          SELECT b.project_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = task
        ) DESC
        LIMIT 1
      )
    END
  )
$$;--> statement-breakpoint
-- Forced row-level security would hide every row from the owner, so it is
-- lifted around the backfill. Entries of people no longer in any project stay unnamed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('task_history', 'project_members')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'history_assignee_names must run as the owner of task_history and project_members, or as a role that bypasses row-level security: % would see no rows and leave the history unnamed', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_history" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "task_history" h SET "name" = (
  SELECT coalesce(us."name", pm."name", pm."email")
  FROM "project_members" pm
  LEFT JOIN "user_settings" us ON us."email" = lower(pm."email")
  WHERE pm."user_id" = (coalesce(h."to", h."from") #>> '{}')::uuid
    AND pm."org_id" IS NOT DISTINCT FROM h."org_id"
  LIMIT 1
)
WHERE h."field" = 'assignees';--> statement-breakpoint
ALTER TABLE "task_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;
