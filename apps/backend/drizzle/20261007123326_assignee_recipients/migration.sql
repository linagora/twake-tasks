-- An assignment names its assignee as its recipient, with the email of their membership in the
-- task's project, so that its consumers can tell them without looking them up. An assignee who is
-- not a member gets no recipient.
CREATE OR REPLACE FUNCTION publish_history_entry() RETURNS trigger
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
