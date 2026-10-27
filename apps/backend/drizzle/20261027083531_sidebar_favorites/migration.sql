ALTER TABLE "sidebar_sections" ADD COLUMN "favorites" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sidebar_sections" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sidebar_sections_one_favorites" ON "sidebar_sections" ("user_id") WHERE "favorites";--> statement-breakpoint
ALTER TABLE "sidebar_sections" ADD CONSTRAINT "sidebar_sections_named" CHECK ("favorites" or "name" is not null);