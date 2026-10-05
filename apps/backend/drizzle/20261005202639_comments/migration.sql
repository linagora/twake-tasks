CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"task_id" uuid NOT NULL,
	"org_id" text,
	"author_id" uuid NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "comments_task_id_created_at_index" ON "comments" ("task_id","created_at");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "comments" AS PERMISSIVE FOR ALL TO public USING ("comments"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comments"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "comments"."task_id"))) WITH CHECK ("comments"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comments"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "comments"."task_id")));