-- A comment that mentions project members publishes one event per mentioned member, other
-- than its author, without the comment's text, which stays in Tasks.
CREATE OR REPLACE FUNCTION notify_comment() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  followers uuid[] := followers_of(NEW.task_id);
  mentioned uuid[] := array(
    SELECT project_members.user_id
    FROM tasks
    JOIN boards ON boards.id = tasks.board_id
    JOIN project_members ON project_members.project_id = boards.project_id
    WHERE tasks.id = NEW.task_id
      AND lower(project_members.email) IN (
        SELECT lower(mention[1]) FROM regexp_matches(NEW.body,
          '(?:^|\s)@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*[A-Za-z0-9])', 'g') AS mention
      )
  );
  person uuid;
BEGIN
  PERFORM follow_task(NEW.task_id, NEW.author_id);
  FOREACH person IN ARRAY mentioned LOOP
    PERFORM follow_task(NEW.task_id, person);
  END LOOP;
  PERFORM notify_task(NEW.task_id, mentioned, 'mentioned', NEW.author_id, NULL, NEW.id);
  PERFORM notify_task(NEW.task_id,
    array(SELECT unnest(followers) EXCEPT SELECT unnest(mentioned)), 'following',
    NEW.author_id, NULL, NEW.id);
  PERFORM publish_task_event(NEW.task_id, 'commented', jsonb_build_object('recipients',
    jsonb_build_array(jsonb_build_object(
      'uuid', project_members.user_id,
      'email', project_members.email,
      'reason', 'mentioned'
    ))))
  FROM tasks
  JOIN boards ON boards.id = tasks.board_id
  JOIN project_members ON project_members.project_id = boards.project_id
  WHERE tasks.id = NEW.task_id
    AND project_members.user_id = ANY(mentioned)
    AND project_members.user_id <> NEW.author_id;
  RETURN NULL;
END
$$;
