CREATE TABLE "task_history" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"task_id" uuid NOT NULL,
	"org_id" text,
	"actor_id" uuid,
	"actor_email" text NOT NULL,
	"field" text NOT NULL,
	"from" jsonb,
	"to" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "task_history_task_id_at_index" ON "task_history" ("task_id","at");--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "tenant" ON "task_history" AS PERMISSIVE FOR ALL TO public USING ("task_history"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_history"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_history"."task_id"))) WITH CHECK ("task_history"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_history"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_history"."task_id")));--> statement-breakpoint
-- The actor is the person of the transaction, set by inTenant, so a change
-- made by a trigger (a sub-task completed with its parent) is theirs too.
CREATE FUNCTION log_task_change(task uuid, org text, field text, old jsonb, new jsonb) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO task_history (task_id, org_id, actor_id, actor_email, field, "from", "to")
  VALUES (
    task, org,
    nullif(current_setting('app.user_id', true), '')::uuid,
    coalesce(current_setting('app.user_email', true), ''),
    field, old, new
  )
$$;--> statement-breakpoint
CREATE FUNCTION completion_of(completed timestamptz, canceled timestamptz) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN completed IS NOT NULL THEN '"completed"'::jsonb
    WHEN canceled IS NOT NULL THEN '"canceled"'::jsonb
  END
$$;--> statement-breakpoint
CREATE FUNCTION record_task_change() RETURNS trigger
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
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'dueDate', to_jsonb(OLD.due_date), to_jsonb(NEW.due_date));
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
$$;--> statement-breakpoint
CREATE TRIGGER tasks_record_change AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION record_task_change();--> statement-breakpoint
-- A row removed because its task is being deleted is not a change to record.
CREATE FUNCTION record_link_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  link jsonb := to_jsonb(CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END);
  task uuid := (link ->> 'task_id')::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], NULL, link -> TG_ARGV[1]);
  ELSIF EXISTS (SELECT 1 FROM tasks WHERE id = task) THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], link -> TG_ARGV[1], NULL);
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER task_assignees_record_change AFTER INSERT OR DELETE ON task_assignees
  FOR EACH ROW EXECUTE FUNCTION record_link_change('assignees', 'user_id');--> statement-breakpoint
CREATE TRIGGER task_labels_record_change AFTER INSERT OR DELETE ON task_labels
  FOR EACH ROW EXECUTE FUNCTION record_link_change('labels', 'label_id');
