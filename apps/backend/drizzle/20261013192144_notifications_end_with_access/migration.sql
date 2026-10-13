ALTER POLICY "own_select" ON "notifications" TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.revoking_access', true) = 'on');--> statement-breakpoint
ALTER POLICY "own_delete" ON "notifications" TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.revoking_access', true) = 'on');--> statement-breakpoint
-- A notification of a task its recipient can no longer open would come back
-- with its old date once they regain access. Removals and moves now drop them;
-- this clears what they left behind. The tables are forced to row-level
-- security even for their owner, which would hide every row from a migration
-- and make the anti-join delete everything, so it is lifted around the delete.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('notifications', 'tasks', 'boards', 'project_members')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'notifications_end_with_access must run as the owner of notifications, tasks, boards and project_members, or as a role that bypasses row-level security: % would see no rows and delete every notification', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "notifications" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "notifications" n
WHERE NOT EXISTS (
  SELECT 1
  FROM "tasks" t
  JOIN "boards" b ON b."id" = t."board_id"
  JOIN "project_members" m ON m."project_id" = b."project_id"
  WHERE t."id" = n."task_id" AND m."user_id" = n."user_id"
);--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;