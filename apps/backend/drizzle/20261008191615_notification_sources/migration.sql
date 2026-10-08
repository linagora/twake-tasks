ALTER TABLE "notifications" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "history_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_history_id_task_history_id_fkey" FOREIGN KEY ("history_id") REFERENCES "task_history"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "notifications_history_id_index" ON "notifications" ("history_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_id_index" ON "notifications" ("comment_id");--> statement-breakpoint
DROP FUNCTION notify_task(uuid, uuid[], text);--> statement-breakpoint
-- An unread notification for the same task and reason already says it, so a
-- second one is dropped. Nobody is notified of their own change.
CREATE FUNCTION notify_task(
  task uuid, people uuid[], reason text,
  actor uuid, history uuid, comment uuid
) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO notifications (task_id, org_id, user_id, reason, actor_id, history_id, comment_id)
  SELECT tasks.id, tasks.org_id, person, reason, actor, history, comment
  FROM tasks, unnest(people) AS person
  WHERE tasks.id = task
    AND person IS DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid
  ON CONFLICT DO NOTHING
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_history_entry() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  followers uuid[] := followers_of(NEW.task_id);
  assignee uuid := CASE WHEN NEW.field = 'assignees' THEN (NEW."to" #>> '{}')::uuid END;
BEGIN
  IF NEW.field = 'created' THEN
    PERFORM follow_task(NEW.task_id, NEW.actor_id);
  ELSIF assignee IS NOT NULL THEN
    PERFORM follow_task(NEW.task_id, assignee);
    PERFORM notify_task(NEW.task_id, ARRAY[assignee], 'assigned', NEW.actor_id, NEW.id, NULL);
    PERFORM notify_task(NEW.task_id, array_remove(followers, assignee), 'following', NEW.actor_id, NEW.id, NULL);
  ELSE
    PERFORM notify_task(NEW.task_id, followers, 'following', NEW.actor_id, NEW.id, NULL);
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
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
  RETURN NULL;
END
$$;
