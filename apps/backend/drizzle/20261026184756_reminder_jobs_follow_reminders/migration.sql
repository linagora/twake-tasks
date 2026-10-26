-- No foreign key reaches a job, so a reminder's job goes with the reminder,
-- also when a deleted task, board or project cascades to it.
CREATE FUNCTION unschedule_reminder() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM jobs WHERE key = 'reminder:' || OLD.id;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER task_reminders_unschedule AFTER DELETE ON task_reminders
  FOR EACH ROW EXECUTE FUNCTION unschedule_reminder();--> statement-breakpoint
-- Forced row-level security would hide every reminder from the owner, and
-- every job would then look orphaned, so it is lifted around the cleanup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = 'task_reminders'
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'reminder_jobs_follow_reminders must run as the owner of task_reminders, or as a role that bypasses row-level security: % would see no reminders and delete every reminder job', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_reminders" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "jobs" j
WHERE j."kind" = 'reminder'
  AND NOT EXISTS (
    SELECT 1 FROM "task_reminders" r
    WHERE r."id" = (j."payload"->>'reminderId')::uuid
  );--> statement-breakpoint
ALTER TABLE "task_reminders" FORCE ROW LEVEL SECURITY;
