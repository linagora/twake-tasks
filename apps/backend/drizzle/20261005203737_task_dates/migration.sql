CREATE TYPE "duration_unit" AS ENUM('minutes', 'days');--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_time" time(0);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_zone" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "deadline" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "duration_unit" "duration_unit";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_time_on_a_date" CHECK ("due_time" is null or "due_date" is not null);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_zone_on_a_time" CHECK ("due_zone" is null or "due_time" is not null);--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_duration" CHECK (("duration" is null) = ("duration_unit" is null) and "duration" > 0);--> statement-breakpoint
-- The due date entry carries its time and zone, like "2026-11-02 09:30 Europe/Paris".
CREATE FUNCTION due_of(task tasks) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT to_jsonb(nullif(concat_ws(' ', task.due_date, to_char(task.due_time, 'HH24:MI'), task.due_zone), ''))
$$;--> statement-breakpoint
CREATE FUNCTION duration_of(task tasks) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN task.duration IS NOT NULL
    THEN jsonb_build_object('amount', task.duration, 'unit', task.duration_unit) END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION record_task_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'created', NULL, to_jsonb(NEW.title));
    RETURN NULL;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'title', to_jsonb(OLD.title), to_jsonb(NEW.title));
  END IF;
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'priority', to_jsonb(OLD.priority), to_jsonb(NEW.priority));
  END IF;
  IF due_of(NEW) IS DISTINCT FROM due_of(OLD) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'dueDate', due_of(OLD), due_of(NEW));
  END IF;
  IF NEW.deadline IS DISTINCT FROM OLD.deadline THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'deadline', to_jsonb(OLD.deadline), to_jsonb(NEW.deadline));
  END IF;
  IF duration_of(NEW) IS DISTINCT FROM duration_of(OLD) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'duration', duration_of(OLD), duration_of(NEW));
  END IF;
  IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'section', to_jsonb(OLD.section_id), to_jsonb(NEW.section_id));
  END IF;
  IF completion_of(NEW.completed_at, NEW.canceled_at) IS DISTINCT FROM completion_of(OLD.completed_at, OLD.canceled_at) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'completion',
      completion_of(OLD.completed_at, OLD.canceled_at), completion_of(NEW.completed_at, NEW.canceled_at));
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'description', NULL, NULL);
  END IF;
  RETURN NULL;
END
$$;