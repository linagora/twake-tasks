CREATE TABLE "comment_edits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"comment_id" uuid NOT NULL,
	"org_id" text,
	"body" text NOT NULL,
	"written_at" timestamp with time zone NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment_edits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment_edits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "comment_edits_comment_id_written_at_index" ON "comment_edits" ("comment_id","written_at");--> statement-breakpoint
ALTER TABLE "comment_edits" ADD CONSTRAINT "comment_edits_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_edits" ADD CONSTRAINT "comment_edits_tenant_comment_id_comments_tenant_id_fkey" FOREIGN KEY ("tenant","comment_id") REFERENCES "comments"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "comment_edits" AS PERMISSIVE FOR ALL TO public USING ("comment_edits"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comment_edits"."org_id" is not null or exists (select 1 from "comments" where "comments"."id" = "comment_edits"."comment_id"))) WITH CHECK ("comment_edits"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comment_edits"."org_id" is not null or exists (select 1 from "comments" where "comments"."id" = "comment_edits"."comment_id")));