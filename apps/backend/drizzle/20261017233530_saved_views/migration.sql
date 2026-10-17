ALTER TABLE "saved_filters" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "icon" text;