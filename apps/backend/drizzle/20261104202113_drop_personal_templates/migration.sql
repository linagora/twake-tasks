DROP POLICY "own" ON "task_templates";--> statement-breakpoint
ALTER POLICY "tenant" ON "task_templates" TO public USING ("task_templates"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_templates"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "task_templates"."project_id"))) WITH CHECK ("task_templates"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_templates"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "task_templates"."project_id")));--> statement-breakpoint
-- Forced row-level security would hide every row from the owner, so it is
-- lifted around the delete of the personal templates.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = 'task_templates'
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'drop_personal_templates must run as the owner of task_templates, or as a role that bypasses row-level security: % would see no rows and fail to make project_id required', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "task_templates" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "task_templates" WHERE "user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "task_templates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_templates" DROP CONSTRAINT "task_templates_project_or_person";--> statement-breakpoint
DROP INDEX "task_templates_user_id_index";--> statement-breakpoint
-- contract: no release served personal templates, unused since backend 0.2.24
ALTER TABLE "task_templates" DROP COLUMN "user_id";--> statement-breakpoint
-- contract: no release served personal templates, unused since backend 0.2.24
ALTER TABLE "task_templates" ALTER COLUMN "project_id" SET NOT NULL;
