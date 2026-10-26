CREATE TYPE "board_background" AS ENUM('orbitalblue', 'earlymorning', 'dawn', 'stellarburst', 'blossom', 'lagoon', 'ripple', 'custom');--> statement-breakpoint
CREATE TABLE "board_background_images" (
	"board_id" uuid PRIMARY KEY,
	"id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"content_type" text NOT NULL,
	"content" bytea NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_background_images" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_background_images" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "background" "board_background";--> statement-breakpoint
ALTER TABLE "board_background_images" ADD CONSTRAINT "board_background_images_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_background_images" ADD CONSTRAINT "board_background_images_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "board_background_images" AS PERMISSIVE FOR ALL TO public USING ("board_background_images"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_background_images"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_background_images"."board_id"))) WITH CHECK ("board_background_images"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_background_images"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_background_images"."board_id")));