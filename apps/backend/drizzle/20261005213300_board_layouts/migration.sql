CREATE TYPE "board_layout" AS ENUM('board', 'list', 'calendar');--> statement-breakpoint
CREATE TABLE "board_layouts" (
	"board_id" uuid,
	"org_id" text,
	"user_id" uuid,
	"layout" "board_layout" NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "board_layouts_pkey" PRIMARY KEY("user_id","board_id")
);
--> statement-breakpoint
ALTER TABLE "board_layouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_layouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "layout" "board_layout" DEFAULT 'board'::"board_layout" NOT NULL;--> statement-breakpoint
ALTER TABLE "board_layouts" ADD CONSTRAINT "board_layouts_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_layouts" ADD CONSTRAINT "board_layouts_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "board_layouts" AS PERMISSIVE FOR ALL TO public USING ("board_layouts"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_layouts"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_layouts"."board_id"))) WITH CHECK ("board_layouts"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_layouts"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_layouts"."board_id")));--> statement-breakpoint
CREATE POLICY "own" ON "board_layouts" AS RESTRICTIVE FOR ALL TO public USING ("board_layouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("board_layouts"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);