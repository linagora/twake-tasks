CREATE TABLE "comment_reactions" (
	"comment_id" uuid,
	"org_id" text,
	"user_id" uuid,
	"user_email" text NOT NULL,
	"emoji" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "comment_reactions_pkey" PRIMARY KEY("comment_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "comment_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comment_reactions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_tenant_id_unique" UNIQUE("tenant","id");--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_tenant_comment_id_comments_tenant_id_fkey" FOREIGN KEY ("tenant","comment_id") REFERENCES "comments"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "comment_reactions" AS PERMISSIVE FOR ALL TO public USING ("comment_reactions"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comment_reactions"."org_id" is not null or exists (select 1 from "comments" where "comments"."id" = "comment_reactions"."comment_id"))) WITH CHECK ("comment_reactions"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("comment_reactions"."org_id" is not null or exists (select 1 from "comments" where "comments"."id" = "comment_reactions"."comment_id")));