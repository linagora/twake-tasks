CREATE TABLE "task_template_assignees" (
	"template_id" uuid,
	"org_id" text,
	"user_id" uuid,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_template_assignees_pkey" PRIMARY KEY("template_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_template_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_template_assignees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_template_labels" (
	"template_id" uuid,
	"label_id" uuid,
	"org_id" text,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_template_labels_pkey" PRIMARY KEY("template_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "task_template_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_template_labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"project_id" uuid,
	"user_id" uuid,
	"org_id" text,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" smallint,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_templates_tenant_id_unique" UNIQUE("tenant","id"),
	CONSTRAINT "task_templates_project_or_person" CHECK (("project_id" is null) <> ("user_id" is null)),
	CONSTRAINT "task_templates_priority" CHECK ("priority" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "task_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "template_id" uuid;--> statement-breakpoint
CREATE INDEX "task_template_assignees_user_id_index" ON "task_template_assignees" ("user_id");--> statement-breakpoint
CREATE INDEX "task_template_labels_label_id_index" ON "task_template_labels" ("label_id");--> statement-breakpoint
CREATE INDEX "task_templates_project_id_index" ON "task_templates" ("project_id");--> statement-breakpoint
CREATE INDEX "task_templates_user_id_index" ON "task_templates" ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_template_id_index" ON "tasks" ("template_id");--> statement-breakpoint
ALTER TABLE "task_template_assignees" ADD CONSTRAINT "task_template_assignees_template_id_task_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_template_assignees" ADD CONSTRAINT "task_template_assignees_DMHbvl2tapQ6_fkey" FOREIGN KEY ("tenant","template_id") REFERENCES "task_templates"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_template_labels" ADD CONSTRAINT "task_template_labels_template_id_task_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_template_labels" ADD CONSTRAINT "task_template_labels_label_id_labels_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_template_labels" ADD CONSTRAINT "task_template_labels_84YgSKRyLGEn_fkey" FOREIGN KEY ("tenant","template_id") REFERENCES "task_templates"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_template_labels" ADD CONSTRAINT "task_template_labels_tenant_label_id_labels_tenant_id_fkey" FOREIGN KEY ("tenant","label_id") REFERENCES "labels"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_not_recurring" CHECK ("template_id" is null or "recur_every" is null);--> statement-breakpoint
CREATE POLICY "tenant" ON "task_template_assignees" AS PERMISSIVE FOR ALL TO public USING ("task_template_assignees"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_template_assignees"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "task_template_assignees"."template_id"))) WITH CHECK ("task_template_assignees"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_template_assignees"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "task_template_assignees"."template_id")));--> statement-breakpoint
CREATE POLICY "tenant" ON "task_template_labels" AS PERMISSIVE FOR ALL TO public USING ("task_template_labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_template_labels"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "task_template_labels"."template_id"))) WITH CHECK ("task_template_labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_template_labels"."org_id" is not null or exists (select 1 from "task_templates" where "task_templates"."id" = "task_template_labels"."template_id")));--> statement-breakpoint
CREATE POLICY "tenant" ON "task_templates" AS PERMISSIVE FOR ALL TO public USING ("task_templates"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_templates"."org_id" is not null or "task_templates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (select 1 from "projects" where "projects"."id" = "task_templates"."project_id"))) WITH CHECK ("task_templates"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_templates"."org_id" is not null or "task_templates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or exists (select 1 from "projects" where "projects"."id" = "task_templates"."project_id")));--> statement-breakpoint
CREATE POLICY "own" ON "task_templates" AS RESTRICTIVE FOR ALL TO public USING ("task_templates"."user_id" is null or "task_templates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.erasing_organization', true) = 'on') WITH CHECK ("task_templates"."user_id" is null or "task_templates"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);