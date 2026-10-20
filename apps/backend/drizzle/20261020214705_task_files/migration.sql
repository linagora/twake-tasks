CREATE TABLE "task_files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"task_id" uuid NOT NULL,
	"org_id" text,
	"url" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"size" bigint,
	"drive_file_id" text,
	"added_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "task_files_task_id_created_at_index" ON "task_files" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_files" ADD CONSTRAINT "task_files_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "task_files" AS PERMISSIVE FOR ALL TO public USING ("task_files"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_files"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_files"."task_id"))) WITH CHECK ("task_files"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_files"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_files"."task_id")));