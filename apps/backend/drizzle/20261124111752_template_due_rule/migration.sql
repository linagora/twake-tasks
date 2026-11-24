CREATE TYPE "schedule_previous" AS ENUM('keep', 'overwrite');--> statement-breakpoint
ALTER TABLE "template_schedules" ADD COLUMN "due" jsonb;--> statement-breakpoint
ALTER TABLE "template_schedules" ADD COLUMN "previous" "schedule_previous" DEFAULT 'keep'::"schedule_previous" NOT NULL;