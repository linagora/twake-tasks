CREATE TABLE "sidebar_section_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"section_id" uuid NOT NULL,
	"org_id" text,
	"user_id" uuid NOT NULL,
	"board_id" uuid,
	"filter_id" uuid,
	"position" integer NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "sidebar_section_items_user_id_board_id_unique" UNIQUE("user_id","board_id"),
	CONSTRAINT "sidebar_section_items_user_id_filter_id_unique" UNIQUE("user_id","filter_id"),
	CONSTRAINT "sidebar_section_items_one_target" CHECK (("board_id" is null) <> ("filter_id" is null))
);
--> statement-breakpoint
ALTER TABLE "sidebar_section_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sidebar_section_items" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sidebar_sections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" text,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sidebar_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sidebar_sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_views" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "sidebar_sections_user_id_index" ON "sidebar_sections" ("user_id");--> statement-breakpoint
ALTER TABLE "sidebar_section_items" ADD CONSTRAINT "sidebar_section_items_section_id_sidebar_sections_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sidebar_sections"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sidebar_section_items" ADD CONSTRAINT "sidebar_section_items_filter_id_saved_filters_id_fkey" FOREIGN KEY ("filter_id") REFERENCES "saved_filters"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sidebar_section_items" ADD CONSTRAINT "sidebar_section_items_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant" ON "sidebar_section_items" AS PERMISSIVE FOR ALL TO public USING ("sidebar_section_items"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("sidebar_section_items"."org_id" is not null or "sidebar_section_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK ("sidebar_section_items"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("sidebar_section_items"."org_id" is not null or "sidebar_section_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "own" ON "sidebar_section_items" AS RESTRICTIVE FOR ALL TO public USING ("sidebar_section_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.erasing_organization', true) = 'on') WITH CHECK ("sidebar_section_items"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant" ON "sidebar_sections" AS PERMISSIVE FOR ALL TO public USING ("sidebar_sections"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("sidebar_sections"."org_id" is not null or "sidebar_sections"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK ("sidebar_sections"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("sidebar_sections"."org_id" is not null or "sidebar_sections"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "own" ON "sidebar_sections" AS RESTRICTIVE FOR ALL TO public USING ("sidebar_sections"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid or current_setting('app.erasing_organization', true) = 'on') WITH CHECK ("sidebar_sections"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);