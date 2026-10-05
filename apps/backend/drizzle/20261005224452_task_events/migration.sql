-- Task events come from the history, so a change made by a trigger or a job is
-- published like one made through the API, and in the same transaction.
CREATE FUNCTION without_nulls(object jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(object) WHERE value <> 'null'::jsonb
$$;--> statement-breakpoint
CREATE FUNCTION publish_task_event(task uuid, action text, details jsonb) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO outbox (key, event)
  SELECT coalesce(boards.space_id, boards.id)::text, without_nulls(jsonb_build_object(
    'specversion', '1.0',
    'id', uuidv7()::text,
    'source', 'twake://tasks',
    'type', 'com.twake.tasks.task.' || action || '.v1',
    'time', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'twakeorg', tasks.org_id,
    'twakeactorid', nullif(current_setting('app.user_id', true), ''),
    'twakeactor', nullif(current_setting('app.user_email', true), ''),
    'data', jsonb_build_object('object', without_nulls(jsonb_build_object(
      'type', 'task',
      'id', tasks.id,
      'key', boards.key_prefix || '-' || tasks.number,
      'title', tasks.title,
      'url', rtrim(nullif(current_setting('app.url', true), ''), '/')
        || '/boards/' || boards.id || '?task=' || boards.key_prefix || '-' || tasks.number,
      'board', jsonb_build_object('id', boards.id, 'name', boards.name),
      'space_id', boards.space_id
    ))) || details
  ))
  FROM tasks JOIN boards ON boards.id = tasks.board_id
  WHERE tasks.id = task
$$;--> statement-breakpoint
CREATE FUNCTION publish_history_entry() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  CASE
    WHEN NEW.field = 'created' THEN
      PERFORM publish_task_event(NEW.task_id, 'created', '{}');
    WHEN NEW.field = 'section' THEN
      NULL;
    WHEN NEW.field = 'completion' AND NEW."to" = '"completed"' THEN
      PERFORM publish_task_event(NEW.task_id, 'completed', '{}');
    WHEN NEW.field = 'completion' AND NEW."to" IS NULL THEN
      PERFORM publish_task_event(NEW.task_id, 'reopened', '{}');
    WHEN NEW.field = 'assignees' AND NEW."to" IS NOT NULL THEN
      PERFORM publish_task_event(NEW.task_id, 'assigned',
        jsonb_build_object('assignee', jsonb_build_object('id', NEW."to")));
    WHEN NEW.field = 'assignees' THEN
      PERFORM publish_task_event(NEW.task_id, 'unassigned',
        jsonb_build_object('assignee', jsonb_build_object('id', NEW."from")));
    ELSE
      PERFORM publish_task_event(NEW.task_id, 'updated', jsonb_build_object('changes',
        jsonb_build_object(NEW.field, jsonb_build_object('from', NEW."from", 'to', NEW."to"))));
  END CASE;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER task_history_publish AFTER INSERT ON task_history
  FOR EACH ROW EXECUTE FUNCTION publish_history_entry();--> statement-breakpoint
-- Named to fire before tasks_record_change, so moving a task to a done section
-- publishes moved, then completed.
CREATE FUNCTION publish_task_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.board_id IS DISTINCT FROM OLD.board_id OR NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    PERFORM publish_task_event(NEW.id, 'moved', jsonb_build_object('changes', without_nulls(jsonb_build_object(
      'board', CASE WHEN NEW.board_id IS DISTINCT FROM OLD.board_id
        THEN jsonb_build_object('from', OLD.board_id, 'to', NEW.board_id) END,
      'section', jsonb_build_object('from', OLD.section_id, 'to', NEW.section_id)
    ))));
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM publish_task_event(NEW.id, 'deleted', '{}');
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM publish_task_event(NEW.id, 'restored', '{}');
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER tasks_publish_change AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION publish_task_change();
