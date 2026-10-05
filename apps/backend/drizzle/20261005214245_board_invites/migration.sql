CREATE TABLE "board_invites" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"board_id" uuid NOT NULL,
	"org_id" text,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "board_invites_board_id_email_unique" UNIQUE("board_id","email"),
	CONSTRAINT "board_invites_email_lower" CHECK ("email" = lower("email"))
);
--> statement-breakpoint
ALTER TABLE "board_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "board_invites_email_index" ON "board_invites" ("email");--> statement-breakpoint
ALTER TABLE "board_invites" ADD CONSTRAINT "board_invites_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_invites" ADD CONSTRAINT "board_invites_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "board_invites" AS PERMISSIVE FOR ALL TO public USING ("board_invites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_invites"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_invites"."board_id") or "board_invites"."email" = lower(current_setting('app.user_email', true)))) WITH CHECK ("board_invites"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("board_invites"."org_id" is not null or exists (select 1 from "boards" where "boards"."id" = "board_invites"."board_id") or "board_invites"."email" = lower(current_setting('app.user_email', true))));