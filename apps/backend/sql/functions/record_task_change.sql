CREATE OR REPLACE FUNCTION public.record_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;
