CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" text,
	"space_id" uuid,
	"owner_id" uuid,
	"name" text NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "labels_tenant_id_unique" UNIQUE("tenant","id"),
	CONSTRAINT "labels_space_id_name_unique" UNIQUE("space_id","name"),
	CONSTRAINT "labels_org_id_owner_id_name_unique" UNIQUE NULLS NOT DISTINCT("org_id","owner_id","name"),
	CONSTRAINT "labels_space_or_owner" CHECK (("space_id" is null) <> ("owner_id" is null))
);
--> statement-breakpoint
ALTER TABLE "labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_labels" (
	"task_id" uuid,
	"label_id" uuid,
	"org_id" text,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_labels_pkey" PRIMARY KEY("task_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "task_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_org_id_space_id_spaces_org_id_id_fkey" FOREIGN KEY ("org_id","space_id") REFERENCES "spaces"("org_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_label_id_labels_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_labels" ADD CONSTRAINT "task_labels_tenant_label_id_labels_tenant_id_fkey" FOREIGN KEY ("tenant","label_id") REFERENCES "labels"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "labels" AS PERMISSIVE FOR ALL TO public USING ("labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("labels"."org_id" is not null or exists (select 1 from "boards" where "boards"."owner_id" = "labels"."owner_id"))) WITH CHECK ("labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("labels"."org_id" is not null or exists (select 1 from "boards" where "boards"."owner_id" = "labels"."owner_id")));--> statement-breakpoint
CREATE POLICY "tenant" ON "task_labels" AS PERMISSIVE FOR ALL TO public USING ("task_labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_labels"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_labels"."task_id"))) WITH CHECK ("task_labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_labels"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_labels"."task_id")));