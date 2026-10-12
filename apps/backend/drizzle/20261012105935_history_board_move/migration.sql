-- A move to another board is one entry on the task moved, naming both boards
-- as they were named then: the task may leave a board its readers cannot open.
-- Its sub-tasks get no entry of their own: one each would notify their
-- followers once per sub-task. The section the task lands in belongs to the
-- other board, so it is not a section change.
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
  RETURN NULL;
END
$$;--> statement-breakpoint
-- Labels follow a task to another project by name, swapping each one for its
-- namesake there. The board entry already says so, so no label entries are
-- logged while the move sets app.following_labels.
CREATE OR REPLACE FUNCTION record_link_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  link jsonb := to_jsonb(CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END);
  task uuid := (link ->> 'task_id')::uuid;
BEGIN
  IF TG_ARGV[0] = 'labels' AND current_setting('app.following_labels', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], NULL, link -> TG_ARGV[1]);
  ELSIF EXISTS (SELECT 1 FROM tasks WHERE id = task) THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], link -> TG_ARGV[1], NULL);
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
-- The move is published as moved, by publish_task_change.
CREATE OR REPLACE FUNCTION publish_history_entry() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  CASE
    WHEN NEW.field = 'created' THEN
      PERFORM publish_task_event(NEW.task_id, 'created', '{}');
    WHEN NEW.field IN ('section', 'board') THEN
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
