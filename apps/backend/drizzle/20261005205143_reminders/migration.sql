CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"task_id" uuid NOT NULL,
	"org_id" text,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_reminders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"task_id" uuid NOT NULL,
	"org_id" text,
	"user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"at" timestamp with time zone,
	"before_minutes" integer,
	"zone" text,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_reminders_at_or_before" CHECK (("at" is null) <> ("before_minutes" is null)
        and ("before_minutes" is null) = ("zone" is null)
        and "before_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "task_reminders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_reminders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_index" ON "notifications" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "task_reminders_task_id_index" ON "task_reminders" ("task_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "notifications" AS PERMISSIVE FOR ALL TO public USING ("notifications"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("notifications"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "notifications"."task_id"))) WITH CHECK ("notifications"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("notifications"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "notifications"."task_id")));--> statement-breakpoint
CREATE POLICY "own" ON "notifications" AS RESTRICTIVE FOR ALL TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant" ON "task_reminders" AS PERMISSIVE FOR ALL TO public USING ("task_reminders"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_reminders"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_reminders"."task_id"))) WITH CHECK ("task_reminders"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_reminders"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_reminders"."task_id")));--> statement-breakpoint
CREATE POLICY "own" ON "task_reminders" AS RESTRICTIVE FOR ALL TO public USING ("task_reminders"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("task_reminders"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
-- Null without a due date. A date without a time counts from nine in the morning.
CREATE FUNCTION reminder_time(due_date date, due_time time, due_zone text, zone text, before_minutes integer)
  RETURNS timestamptz
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((due_date + coalesce(due_time, '09:00')) AT TIME ZONE coalesce(due_zone, zone))
    - make_interval(mins => before_minutes)
$$;--> statement-breakpoint
-- A relative reminder's job holds what it needs to follow the due date, since
-- whoever moves the date cannot read other people's reminders.
CREATE INDEX "jobs_reminder_task_index" ON "jobs" ((payload->>'taskId')) WHERE kind = 'reminder';