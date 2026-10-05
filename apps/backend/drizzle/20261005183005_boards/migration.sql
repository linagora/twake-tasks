CREATE TYPE "section_category" AS ENUM('backlog', 'unstarted', 'started', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "member_role" AS ENUM('viewer', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE "board_favorites" (
	"board_id" uuid,
	"org_id" text,
	"email" text,
	CONSTRAINT "board_favorites_pkey" PRIMARY KEY("email","board_id")
);
--> statement-breakpoint
ALTER TABLE "board_favorites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "board_members" (
	"board_id" uuid,
	"org_id" text,
	"email" text,
	"role" "member_role" NOT NULL,
	CONSTRAINT "board_members_pkey" PRIMARY KEY("board_id","email")
);
--> statement-breakpoint
ALTER TABLE "board_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" text,
	"space_id" uuid,
	"owner_email" text,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"task_counter" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "boards_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "boards_space_id_key_prefix_unique" UNIQUE("space_id","key_prefix"),
	CONSTRAINT "boards_owner_email_key_prefix_unique" UNIQUE("owner_email","key_prefix"),
	CONSTRAINT "boards_space_or_owner" CHECK (("space_id" is null) <> ("owner_email" is null)),
	CONSTRAINT "boards_space_has_organization" CHECK ("space_id" is null or "org_id" is not null),
	CONSTRAINT "boards_key_prefix" CHECK ("key_prefix" ~ '^[A-Z][A-Z0-9]{0,9}$')
);
--> statement-breakpoint
ALTER TABLE "boards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"board_id" uuid NOT NULL,
	"org_id" text,
	"name" text NOT NULL,
	"category" "section_category" NOT NULL,
	"position" text COLLATE "C" NOT NULL,
	CONSTRAINT "sections_board_id_id_unique" UNIQUE("board_id","id"),
	CONSTRAINT "sections_board_id_position_unique" UNIQUE("board_id","position")
);
--> statement-breakpoint
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" uuid,
	"org_id" text,
	"email" text,
	CONSTRAINT "task_assignees_pkey" PRIMARY KEY("task_id","email")
);
--> statement-breakpoint
ALTER TABLE "task_assignees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"board_id" uuid NOT NULL,
	"section_id" uuid,
	"org_id" text,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"priority" smallint,
	"due_date" date,
	"position" text COLLATE "C" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	CONSTRAINT "tasks_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "tasks_board_id_number_unique" UNIQUE("board_id","number"),
	CONSTRAINT "tasks_board_id_section_id_position_unique" UNIQUE NULLS NOT DISTINCT("board_id","section_id","position"),
	CONSTRAINT "tasks_priority" CHECK ("priority" between 1 and 4)
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "space_members" (
	"space_id" uuid,
	"org_id" text NOT NULL,
	"email" text,
	"role" "member_role" NOT NULL,
	CONSTRAINT "space_members_pkey" PRIMARY KEY("space_id","email")
);
--> statement-breakpoint
ALTER TABLE "space_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "spaces_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "spaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_favorites" ADD CONSTRAINT "board_favorites_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_favorites" ADD CONSTRAINT "board_favorites_org_id_board_id_boards_org_id_id_fkey" FOREIGN KEY ("org_id","board_id") REFERENCES "boards"("org_id","id");--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_org_id_board_id_boards_org_id_id_fkey" FOREIGN KEY ("org_id","board_id") REFERENCES "boards"("org_id","id");--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_org_id_space_id_spaces_org_id_id_fkey" FOREIGN KEY ("org_id","space_id") REFERENCES "spaces"("org_id","id");--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_org_id_board_id_boards_org_id_id_fkey" FOREIGN KEY ("org_id","board_id") REFERENCES "boards"("org_id","id");--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_org_id_task_id_tasks_org_id_id_fkey" FOREIGN KEY ("org_id","task_id") REFERENCES "tasks"("org_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_section_id_sections_board_id_id_fkey" FOREIGN KEY ("board_id","section_id") REFERENCES "sections"("board_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_board_id_boards_org_id_id_fkey" FOREIGN KEY ("org_id","board_id") REFERENCES "boards"("org_id","id");--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_org_id_space_id_spaces_org_id_id_fkey" FOREIGN KEY ("org_id","space_id") REFERENCES "spaces"("org_id","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant" ON "board_favorites" AS PERMISSIVE FOR ALL TO public USING ("board_favorites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("board_favorites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "board_members" AS PERMISSIVE FOR ALL TO public USING ("board_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("board_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "boards" AS PERMISSIVE FOR ALL TO public USING ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "sections" AS PERMISSIVE FOR ALL TO public USING ("sections"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("sections"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "task_assignees" AS PERMISSIVE FOR ALL TO public USING ("task_assignees"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("task_assignees"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "tasks" AS PERMISSIVE FOR ALL TO public USING ("tasks"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("tasks"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "space_members" AS PERMISSIVE FOR ALL TO public USING ("space_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("space_members"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));--> statement-breakpoint
CREATE POLICY "tenant" ON "spaces" AS PERMISSIVE FOR ALL TO public USING ("spaces"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '')) WITH CHECK ("spaces"."org_id" is not distinct from nullif(current_setting('app.org_id', true), ''));