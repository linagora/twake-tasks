CREATE TYPE "theme" AS ENUM('light', 'dark', 'auto');--> statement-breakpoint
CREATE TABLE "user_settings" (
	"email" text PRIMARY KEY,
	"version" integer NOT NULL,
	"language" text,
	"timezone" text,
	"theme" "theme",
	"avatar" text,
	"name" text
);
