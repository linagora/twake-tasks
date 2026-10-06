CREATE OR REPLACE FUNCTION publish_task_event(task uuid, action text, details jsonb) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO outbox (event)
  SELECT without_nulls(jsonb_build_object(
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
      'container', jsonb_build_object('kind', 'project', 'id', boards.project_id)
    ))) || details
  ))
  FROM tasks JOIN boards ON boards.id = tasks.board_id
  WHERE tasks.id = task
$$;--> statement-breakpoint
ALTER TABLE "outbox" DROP COLUMN "key";
