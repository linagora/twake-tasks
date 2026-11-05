CREATE TABLE "task_links" (
	"blocking_task_id" uuid,
	"blocked_task_id" uuid,
	"org_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_links_pkey" PRIMARY KEY("blocking_task_id","blocked_task_id"),
	CONSTRAINT "task_links_not_self" CHECK ("blocking_task_id" <> "blocked_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "task_links_blocked_task_id_index" ON "task_links" ("blocked_task_id");--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_blocking_task_id_tasks_id_fkey" FOREIGN KEY ("blocking_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_blocked_task_id_tasks_id_fkey" FOREIGN KEY ("blocked_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_tenant_blocking_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","blocking_task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_tenant_blocked_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","blocked_task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "task_links" AS PERMISSIVE FOR ALL TO public USING ("task_links"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_links"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_links"."blocking_task_id") or exists (select 1 from "tasks" where "tasks"."id" = "task_links"."blocked_task_id"))) WITH CHECK ("task_links"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_links"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_links"."blocking_task_id") and exists (select 1 from "tasks" where "tasks"."id" = "task_links"."blocked_task_id")));