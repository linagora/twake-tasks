DROP INDEX "jobs_reminder_user_index";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
CREATE INDEX "notifications_read_at_index" ON "notifications" ("read_at") WHERE "read_at" is not null;--> statement-breakpoint
CREATE INDEX "jobs_user_id_index" ON "jobs" ("user_id");--> statement-breakpoint
CREATE POLICY "retention_select" ON "notifications" AS PERMISSIVE FOR SELECT TO public USING (current_setting('app.pruning', true) = 'on' and "notifications"."read_at" is not null);--> statement-breakpoint
CREATE POLICY "retention_delete" ON "notifications" AS PERMISSIVE FOR DELETE TO public USING (current_setting('app.pruning', true) = 'on' and "notifications"."read_at" is not null);--> statement-breakpoint
ALTER POLICY "own_select" ON "notifications" TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.revoking_access', true) = 'on' or current_setting('app.pruning', true) = 'on' and "notifications"."read_at" is not null);--> statement-breakpoint
ALTER POLICY "own_delete" ON "notifications" TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.revoking_access', true) = 'on' or current_setting('app.pruning', true) = 'on' and "notifications"."read_at" is not null);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.email_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO jobs (kind, task_id, user_id, payload, run_at)
  VALUES ('notification_email', NEW.task_id, NEW.user_id, jsonb_build_object(
    'notificationId', NEW.id,
    'userId', NEW.user_id,
    'organizationId', NEW.org_id
  ), now());
  RETURN NULL;
END
$function$;--> statement-breakpoint
UPDATE "jobs" SET "user_id" = ("payload"->>'userId')::uuid
WHERE "kind" IN ('reminder', 'notification_email', 'notification_digest');