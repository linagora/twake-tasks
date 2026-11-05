CREATE TABLE "board_covers" (
	"board_id" uuid PRIMARY KEY,
	"org_id" text,
	"content_type" text NOT NULL,
	"content" bytea NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_covers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_covers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_covers" ADD CONSTRAINT "board_covers_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_covers" ADD CONSTRAINT "board_covers_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "board_covers" AS PERMISSIVE FOR ALL TO public USING ("board_covers"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_covers"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_covers"."board_id"))) WITH CHECK ("board_covers"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_covers"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_covers"."board_id")));--> statement-breakpoint
DROP TRIGGER boards_delete_cover ON boards;--> statement-breakpoint
DROP FUNCTION delete_cover();--> statement-breakpoint
DELETE FROM jobs WHERE kind = 'cover_delete';
