ALTER TABLE "boards" DROP CONSTRAINT "boards_owner_email_key_prefix_unique";--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "inbox" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_org_id_owner_email_key_prefix_unique" UNIQUE NULLS NOT DISTINCT("org_id","owner_email","key_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "boards_one_inbox_per_owner" ON "boards" (coalesce("org_id", ''),"owner_email") WHERE "inbox";