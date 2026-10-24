CREATE TABLE "notification_email_budgets" (
	"user_id" uuid PRIMARY KEY,
	"window_start" timestamp with time zone NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"held" integer DEFAULT 0 NOT NULL,
	"digest_scheduled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX "jobs_reminder_user_index" ON "jobs" (("payload"->>'userId')) WHERE "kind" = 'reminder';