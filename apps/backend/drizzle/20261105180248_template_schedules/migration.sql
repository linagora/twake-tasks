CREATE TYPE "schedule_pause" AS ENUM('author', 'board');--> statement-breakpoint
CREATE TABLE "template_schedules" (
	"template_id" uuid PRIMARY KEY,
	"org_id" text,
	"board_id" uuid NOT NULL,
	"rule" jsonb NOT NULL,
	"time" time(0) NOT NULL,
	"zone" text NOT NULL,
	"working_days" boolean NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"paused" boolean DEFAULT false NOT NULL,
	"paused_by" "schedule_pause",
	"next_run_at" timestamp with time zone,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "template_schedules_paused_waits" CHECK (not "paused" or "next_run_at" is null),
	CONSTRAINT "template_schedules_paused_by" CHECK ("paused_by" is null or "paused")
);
--> statement-breakpoint
ALTER TABLE "template_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "template_schedules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "tasks_template_id_index";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_one_per_scheduled_run" ON "tasks" ("template_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "template_schedules_board_id_index" ON "template_schedules" ("board_id");--> statement-breakpoint
ALTER TABLE "template_schedules" ADD CONSTRAINT "template_schedules_template_id_task_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_schedules" ADD CONSTRAINT "template_schedules_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "template_schedules" ADD CONSTRAINT "template_schedules_u9VJs1Jnf68i_fkey" FOREIGN KEY ("tenant","template_id") REFERENCES "task_templates"("tenant","id");--> statement-breakpoint
ALTER TABLE "template_schedules" ADD CONSTRAINT "template_schedules_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "template_schedules" AS PERMISSIVE FOR ALL TO public USING ("template_schedules"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("template_schedules"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "template_schedules"."template_id"))) WITH CHECK ("template_schedules"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("template_schedules"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "template_schedules"."template_id")));