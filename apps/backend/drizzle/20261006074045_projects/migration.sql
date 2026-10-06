-- Boards move into projects. No deployment holds data yet, so this starts afresh.
TRUNCATE "boards", "labels", "spaces", "outbox", "jobs" CASCADE;--> statement-breakpoint
CREATE TABLE "project_invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"project_id" uuid NOT NULL,
	"org_id" text,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "project_invites_project_id_email_unique" UNIQUE("project_id","email"),
	CONSTRAINT "project_invites_email_lower" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
ALTER TABLE "project_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" uuid,
	"org_id" text,
	"user_id" uuid,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "project_members_pkey" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" text,
	"name" text NOT NULL,
	"personal" boolean DEFAULT false NOT NULL,
	"managed" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "projects_tenant_id_unique" UNIQUE("tenant","id"),
	CONSTRAINT "projects_personal_not_managed" CHECK (not ("personal" and "managed"))
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
-- Policies call this as an uncorrelated subquery, so it runs once per statement.
-- app.membership_lookup lets the project_members policy skip its project check
-- while this reads the table, which would otherwise recurse through the projects
-- policy. A function SET clause would restore the flag, but needs a superuser
-- for a custom setting.
CREATE FUNCTION app_member_project_ids() RETURNS uuid[]
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
  ids uuid[];
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  SELECT coalesce(array_agg(project_id), '{}') INTO ids
  FROM project_members
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
  RETURN ids;
END
$$;--> statement-breakpoint
DROP POLICY "tenant" ON "board_invites";--> statement-breakpoint
DROP POLICY "tenant" ON "board_members";--> statement-breakpoint
DROP POLICY "tenant" ON "space_members";--> statement-breakpoint
-- Recreated below: they read the columns about to go.
DROP POLICY "tenant" ON "boards";--> statement-breakpoint
DROP POLICY "tenant" ON "labels";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_org_id_space_id_spaces_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_org_id_space_id_spaces_org_id_id_fkey";--> statement-breakpoint
DROP TABLE "board_invites";--> statement-breakpoint
DROP TABLE "board_members";--> statement-breakpoint
DROP TABLE "space_members";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_space_id_key_prefix_unique";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_space_id_name_unique";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_org_id_owner_id_name_unique";--> statement-breakpoint
ALTER TABLE "spaces" DROP CONSTRAINT "spaces_org_id_id_unique";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_space_or_owner";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_space_has_organization";--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_space_or_owner";--> statement-breakpoint
DROP INDEX "boards_owner_key_prefix";--> statement-breakpoint
DROP INDEX "boards_one_inbox_per_owner";--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "project_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" DROP COLUMN "space_id";--> statement-breakpoint
ALTER TABLE "boards" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "space_id";--> statement-breakpoint
ALTER TABLE "labels" DROP COLUMN "owner_id";--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "spaces" DROP COLUMN "deleted_at";--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_key_prefix_unique" UNIQUE("project_id","key_prefix");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_name_unique" UNIQUE("project_id","name");--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_project_id_unique" UNIQUE("project_id");--> statement-breakpoint
CREATE INDEX "boards_project_id_index" ON "boards" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_one_inbox_per_project" ON "boards" ("project_id") WHERE "inbox";--> statement-breakpoint
CREATE INDEX "project_invites_email_index" ON "project_invites" ("email");--> statement-breakpoint
CREATE INDEX "project_members_user_id_index" ON "project_members" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_one_personal_per_user" ON "projects" (coalesce("org_id", ''),"created_by") WHERE "personal";--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_invites" ADD CONSTRAINT "project_invites_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_tenant_project_id_projects_tenant_id_fkey" FOREIGN KEY ("tenant","project_id") REFERENCES "projects"("tenant","id");--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_org_id_project_id_projects_tenant_id_fkey" FOREIGN KEY ("org_id","project_id") REFERENCES "projects"("tenant","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant" ON "project_invites" AS PERMISSIVE FOR ALL TO public USING ("project_invites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("project_invites"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "project_invites"."project_id") or "project_invites"."email" = lower(current_setting('app.user_email', true)))) WITH CHECK ("project_invites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("project_invites"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "project_invites"."project_id") or "project_invites"."email" = lower(current_setting('app.user_email', true))));--> statement-breakpoint
CREATE POLICY "tenant" ON "project_members" AS PERMISSIVE FOR ALL TO public USING ("project_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("project_members"."org_id" is not null or current_setting('app.membership_lookup', true) = 'on' or exists (select 1 from "projects" where "projects"."id" = "project_members"."project_id"))) WITH CHECK ("project_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("project_members"."org_id" is not null or current_setting('app.membership_lookup', true) = 'on' or exists (select 1 from "projects" where "projects"."id" = "project_members"."project_id")));--> statement-breakpoint
CREATE POLICY "tenant" ON "projects" AS PERMISSIVE FOR ALL TO public USING ("projects"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("projects"."org_id" is not null or "projects"."created_by" = nullif(current_setting('app.user_id', true), '')::uuid or "projects"."id" = any((select app_member_project_ids())::uuid[]))) WITH CHECK ("projects"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("projects"."org_id" is not null or "projects"."created_by" = nullif(current_setting('app.user_id', true), '')::uuid or "projects"."id" = any((select app_member_project_ids())::uuid[])));--> statement-breakpoint
CREATE POLICY "tenant" ON "boards" AS PERMISSIVE FOR ALL TO public USING ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("boards"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "boards"."project_id"))) WITH CHECK ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("boards"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "boards"."project_id")));--> statement-breakpoint
CREATE POLICY "tenant" ON "labels" AS PERMISSIVE FOR ALL TO public USING ("labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("labels"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "labels"."project_id"))) WITH CHECK ("labels"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("labels"."org_id" is not null or exists (select 1 from "projects" where "projects"."id" = "labels"."project_id")));--> statement-breakpoint
DROP FUNCTION app_member_board_ids();--> statement-breakpoint
-- Turns the signed-in person's invites in their tenant into memberships. A B2C
-- guest cannot see the project yet, so the insert runs under app.membership_lookup
-- (see app_member_project_ids); the invites policy still keeps it to their tenant.
CREATE OR REPLACE FUNCTION app_claim_invites() RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  WITH claimed AS (
    DELETE FROM project_invites
    WHERE email = lower(current_setting('app.user_email', true))
    RETURNING project_id, org_id, email, role
  )
  INSERT INTO project_members (project_id, org_id, user_id, email, role)
  SELECT project_id, org_id, nullif(current_setting('app.user_id', true), '')::uuid, email, role
  FROM claimed
  ON CONFLICT (project_id, user_id) DO NOTHING;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION publish_task_event(task uuid, action text, details jsonb) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO outbox (key, event)
  SELECT boards.project_id::text, without_nulls(jsonb_build_object(
    'specversion', '1.0',
    'id', uuidv7()::text,
    'source', 'twake://tasks',
    'type', 'com.twake.tasks.task.' || action || '.v1',
    'time', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'twakeorg', tasks.org_id,
    'twakeactorid', nullif(current_setting('app.user_id', true), ''),
    'twakeactor', nullif(current_setting('app.user_email', true), ''),
    'data', jsonb_build_object('object', without_nulls(jsonb_build_object(
      'type', 'task',
      'id', tasks.id,
      'key', boards.key_prefix || '-' || tasks.number,
      'title', tasks.title,
      'url', rtrim(nullif(current_setting('app.url', true), ''), '/')
        || '/boards/' || boards.id || '?task=' || boards.key_prefix || '-' || tasks.number,
      'board', jsonb_build_object('id', boards.id, 'name', boards.name),
      'container', jsonb_build_object('kind', 'project', 'id', boards.project_id)
    ))) || details
  ))
  FROM tasks JOIN boards ON boards.id = tasks.board_id
  WHERE tasks.id = task
$$;--> statement-breakpoint
-- A mention is "@" and the email of someone who can open the board.
CREATE OR REPLACE FUNCTION notify_comment() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  followers uuid[] := followers_of(NEW.task_id);
  mentioned uuid[] := array(
    SELECT project_members.user_id
    FROM tasks
    JOIN boards ON boards.id = tasks.board_id
    JOIN project_members ON project_members.project_id = boards.project_id
    WHERE tasks.id = NEW.task_id
      AND lower(project_members.email) IN (
        SELECT lower(mention[1]) FROM regexp_matches(NEW.body,
          '(?:^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9])', 'g') AS mention
      )
  );
  person uuid;
BEGIN
  PERFORM follow_task(NEW.task_id, NEW.author_id);
  FOREACH person IN ARRAY mentioned LOOP
    PERFORM follow_task(NEW.task_id, person);
  END LOOP;
  PERFORM notify_task(NEW.task_id, mentioned, 'mentioned');
  PERFORM notify_task(NEW.task_id,
    array(SELECT unnest(followers) EXCEPT SELECT unnest(mentioned)), 'following');
  RETURN NULL;
END
$$;