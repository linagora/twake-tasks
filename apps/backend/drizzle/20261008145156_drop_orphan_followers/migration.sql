-- Someone who is not a member of a task's project cannot open the task, so
-- they must not follow it. Moves and removals now clean up after themselves;
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
      AND tablename IN ('task_followers', 'tasks', 'boards', 'project_members')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'drop_orphan_followers must run as the owner of task_followers, tasks, boards and project_members, or as a role that bypasses row-level security: % would see no rows and delete every follower', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_followers" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "task_followers" f
WHERE NOT EXISTS (
  SELECT 1
  FROM "tasks" t
  JOIN "boards" b ON b."id" = t."board_id"
  JOIN "project_members" m ON m."project_id" = b."project_id"
  WHERE t."id" = f."task_id" AND m."user_id" = f."user_id"
);--> statement-breakpoint
ALTER TABLE "task_followers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;
