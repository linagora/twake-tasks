DROP INDEX "jobs_run_at_index";--> statement-breakpoint
CREATE INDEX "jobs_kind_run_at_index" ON "jobs" ("kind","run_at");