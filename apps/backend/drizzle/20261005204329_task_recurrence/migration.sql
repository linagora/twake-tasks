CREATE TYPE "recurrence_unit" AS ENUM('days', 'weeks', 'months', 'years');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recur_every" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recur_unit" "recurrence_unit";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "recur_from_completion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence" CHECK (("recur_every" is null) = ("recur_unit" is null) and "recur_every" > 0);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_on_a_date" CHECK ("recur_every" is null or "due_date" is not null);