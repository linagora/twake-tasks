CREATE TABLE "processed_events" (
	"consumer" text,
	"source" text,
	"id" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_pkey" PRIMARY KEY("consumer","source","id")
);
--> statement-breakpoint
CREATE TABLE "oidc_revoked_sessions" (
	"sid" text PRIMARY KEY,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "oidc_revoked_sessions_expires_at_index" ON "oidc_revoked_sessions" ("expires_at");