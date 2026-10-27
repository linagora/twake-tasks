-- A follower who is unassigned hears it as being about them, with a reason of
-- its own, so another unread change on the task does not swallow it.
CREATE OR REPLACE FUNCTION notify_history_entry() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  followers uuid[] := followers_of(NEW.task_id);
  assignee uuid := CASE WHEN NEW.field = 'assignees' THEN (NEW."to" #>> '{}')::uuid END;
  unassigned uuid := CASE WHEN NEW.field = 'assignees' THEN (NEW."from" #>> '{}')::uuid END;
BEGIN
  IF NEW.field = 'created' THEN
    PERFORM follow_task(NEW.task_id, NEW.actor_id);
  ELSIF assignee IS NOT NULL THEN
    PERFORM follow_task(NEW.task_id, assignee);
    PERFORM notify_task(NEW.task_id, ARRAY[assignee], 'assigned', NEW.actor_id, NEW.id, NULL);
    PERFORM notify_task(NEW.task_id, array_remove(followers, assignee), 'following', NEW.actor_id, NEW.id, NULL);
  ELSIF unassigned = ANY(followers) THEN
    PERFORM notify_task(NEW.task_id, ARRAY[unassigned], 'unassigned', NEW.actor_id, NEW.id, NULL);
    PERFORM notify_task(NEW.task_id, array_remove(followers, unassigned), 'following', NEW.actor_id, NEW.id, NULL);
  ELSE
    PERFORM notify_task(NEW.task_id, followers, 'following', NEW.actor_id, NEW.id, NULL);
  END IF;
  RETURN NULL;
END
$$;
