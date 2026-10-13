-- Archiving or trashing a task hides its sub-tasks with it, which sets
-- app.cascading: only the task acted on gets an entry, so its followers are
-- notified once.
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
  IF recurrence_of(NEW) IS DISTINCT FROM recurrence_of(OLD) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'recurrence', recurrence_of(OLD), recurrence_of(NEW));
  END IF;
  IF NEW.board_id IS DISTINCT FROM OLD.board_id THEN
    IF NEW.parent_id IS NULL THEN
      PERFORM log_task_change(NEW.id, NEW.org_id, 'board',
        (SELECT jsonb_build_object('id', id, 'name', name) FROM boards WHERE id = OLD.board_id),
        (SELECT jsonb_build_object('id', id, 'name', name) FROM boards WHERE id = NEW.board_id));
    END IF;
  ELSIF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'section', to_jsonb(OLD.section_id), to_jsonb(NEW.section_id));
  END IF;
  IF completion_of(NEW.completed_at, NEW.canceled_at) IS DISTINCT FROM completion_of(OLD.completed_at, OLD.canceled_at) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'completion',
      completion_of(OLD.completed_at, OLD.canceled_at), completion_of(NEW.completed_at, NEW.canceled_at));
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'description', NULL, NULL);
  END IF;
  IF current_setting('app.cascading', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF (NEW.archived_at IS NULL) IS DISTINCT FROM (OLD.archived_at IS NULL) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'archived',
      CASE WHEN OLD.archived_at IS NULL THEN NULL ELSE to_jsonb(true) END,
      CASE WHEN NEW.archived_at IS NULL THEN NULL ELSE to_jsonb(true) END);
  END IF;
  IF (NEW.deleted_at IS NULL) IS DISTINCT FROM (OLD.deleted_at IS NULL) THEN
    PERFORM log_task_change(NEW.id, NEW.org_id, 'deleted',
      CASE WHEN OLD.deleted_at IS NULL THEN NULL ELSE to_jsonb(true) END,
      CASE WHEN NEW.deleted_at IS NULL THEN NULL ELSE to_jsonb(true) END);
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION recurrence_of(t tasks) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN t.recur_every IS NULL THEN NULL ELSE jsonb_build_object(
    'every', t.recur_every,
    'unit', t.recur_unit,
    'fromCompletion', t.recur_from_completion
  ) END
$$;--> statement-breakpoint
-- Archiving and trashing are not published as updates. Trashing and restoring
-- from the trash are published as deleted and restored by publish_task_change;
-- archiving and restoring from the archive are not published.
CREATE OR REPLACE FUNCTION publish_history_entry() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  CASE
    WHEN NEW.field = 'created' THEN
      PERFORM publish_task_event(NEW.task_id, 'created', '{}');
    WHEN NEW.field IN ('section', 'board', 'archived', 'deleted') THEN
      NULL;
    WHEN NEW.field = 'completion' AND NEW."to" = '"completed"' THEN
      PERFORM publish_task_event(NEW.task_id, 'completed', '{}');
    WHEN NEW.field = 'completion' AND NEW."to" IS NULL THEN
      PERFORM publish_task_event(NEW.task_id, 'reopened', '{}');
    WHEN NEW.field = 'assignees' AND NEW."to" IS NOT NULL THEN
      PERFORM publish_task_event(NEW.task_id, 'assigned',
        jsonb_build_object('assignee', jsonb_build_object('id', NEW."to")) || coalesce((
          SELECT jsonb_build_object('recipients', jsonb_build_array(jsonb_build_object(
            'uuid', project_members.user_id,
            'email', project_members.email,
            'reason', 'assigned'
          )))
          FROM tasks
          JOIN boards ON boards.id = tasks.board_id
          JOIN project_members ON project_members.project_id = boards.project_id
            AND project_members.user_id = (NEW."to" #>> '{}')::uuid
          WHERE tasks.id = NEW.task_id
        ), '{}'));
    WHEN NEW.field = 'assignees' THEN
      PERFORM publish_task_event(NEW.task_id, 'unassigned',
        jsonb_build_object('assignee', jsonb_build_object('id', NEW."from")));
    ELSE
      PERFORM publish_task_event(NEW.task_id, 'updated', jsonb_build_object('changes',
        jsonb_build_object(NEW.field, jsonb_build_object('from', NEW."from", 'to', NEW."to"))));
  END CASE;
  RETURN NULL;
END
$$;
