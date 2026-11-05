CREATE TYPE "calendar_feed_scope" AS ENUM('assigned', 'mine');--> statement-breakpoint
CREATE TABLE "calendar_feeds" (
	"user_id" uuid PRIMARY KEY,
	"org_id" text,
	"email" text NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"scope" "calendar_feed_scope" DEFAULT 'assigned'::"calendar_feed_scope" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
