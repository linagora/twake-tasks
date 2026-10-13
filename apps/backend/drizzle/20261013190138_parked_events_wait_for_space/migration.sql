ALTER TABLE "parked_events" ADD COLUMN "space_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "parked_events" ADD COLUMN "retry_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "parked_events_space_id_index" ON "parked_events" ("space_id");