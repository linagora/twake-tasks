ALTER POLICY "own" ON "task_reminders" TO public USING ("task_reminders"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.revoking_access', true) = 'on') WITH CHECK ("task_reminders"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- Removals and moves now drop the reminders of whoever loses access, and the
-- trigger on task_reminders their jobs; this clears what they left behind.
-- Forced row-level security would hide every row from a migration and make
-- the anti-join delete everything, so it is lifted around the delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('task_reminders', 'tasks', 'boards', 'project_members')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'reminders_end_with_access must run as the owner of task_reminders, tasks, boards and project_members, or as a role that bypasses row-level security: % would see no rows and delete every reminder', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_reminders" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "task_reminders" r
WHERE NOT EXISTS (
  SELECT 1
  FROM "tasks" t
  JOIN "boards" b ON b."id" = t."board_id"
  JOIN "project_members" m ON m."project_id" = b."project_id"
  WHERE t."id" = r."task_id" AND m."user_id" = r."user_id"
);--> statement-breakpoint
ALTER TABLE "task_reminders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;
