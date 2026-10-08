CREATE TABLE "invite_emails" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"project_id" uuid NOT NULL,
	"org_id" text,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invite_emails" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "invite_emails_project_id_email_sent_at_index" ON "invite_emails" ("project_id","email","sent_at");--> statement-breakpoint
CREATE INDEX "invite_emails_invited_by_sent_at_index" ON "invite_emails" ("invited_by","sent_at");--> statement-breakpoint
ALTER TABLE "invite_emails" ADD CONSTRAINT "invite_emails_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invite_emails" ADD CONSTRAINT "invite_emails_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "invite_emails" AS PERMISSIVE FOR ALL TO public USING ("invite_emails"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("invite_emails"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "invite_emails"."project_id"))) WITH CHECK ("invite_emails"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("invite_emails"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "invite_emails"."project_id")));