CREATE TABLE "last_changes" (
	"object" text PRIMARY KEY,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parked_events" (
	"message_id" text PRIMARY KEY,
	"exchange" text NOT NULL,
	"routing_key" text NOT NULL,
	"body" jsonb NOT NULL,
	"space_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"parked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "parked_events_parked_at_index" ON "parked_events" ("parked_at");--> statement-breakpoint
CREATE INDEX "parked_events_space_id_index" ON "parked_events" ("space_id");