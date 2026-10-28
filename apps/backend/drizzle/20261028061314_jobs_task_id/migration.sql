ALTER TABLE "jobs" ADD COLUMN "task_id" uuid;--> statement-breakpoint
CREATE INDEX "jobs_task_id_index" ON "jobs" ("task_id");--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.email_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO jobs (kind, task_id, payload, run_at)
  VALUES ('notification_email', NEW.task_id, jsonb_build_object(
    'notificationId', NEW.id,
    'userId', NEW.user_id,
    'organizationId', NEW.org_id
  ), now());
  RETURN NULL;
END
$function$;--> statement-breakpoint
-- Forced row-level security would hide every task and notification from the
-- backfill, so it is lifted around it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('tasks', 'notifications')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'jobs_task_id must run as the owner of tasks and notifications, or as a role that bypasses row-level security: % would see no rows and leave every job without its task', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "jobs" j SET "task_id" = t."id"
FROM "tasks" t
WHERE j."kind" IN ('reminder', 'purge-task')
  AND t."id" = (j."payload"->>'taskId')::uuid;--> statement-breakpoint
UPDATE "jobs" j SET "task_id" = n."task_id"
FROM "notifications" n
WHERE j."kind" = 'notification_email'
  AND n."id" = (j."payload"->>'notificationId')::uuid;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
