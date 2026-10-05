CREATE TABLE "task_followers" (
	"task_id" uuid,
	"org_id" text,
	"user_id" uuid,
	"tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED NOT NULL,
	CONSTRAINT "task_followers_pkey" PRIMARY KEY("task_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "task_followers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_followers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY "own" ON "notifications";--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_id_task_id_reason_index" ON "notifications" ("user_id","task_id","reason") WHERE "read_at" is null;--> statement-breakpoint
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_task_id_tasks_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "task_followers" ADD CONSTRAINT "task_followers_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
CREATE POLICY "own_select" ON "notifications" AS RESTRICTIVE FOR SELECT TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "own_update" ON "notifications" AS RESTRICTIVE FOR UPDATE TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "own_delete" ON "notifications" AS RESTRICTIVE FOR DELETE TO public USING ("notifications"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant" ON "task_followers" AS PERMISSIVE FOR ALL TO public USING ("task_followers"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_followers"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_followers"."task_id"))) WITH CHECK ("task_followers"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("task_followers"."org_id" is not null or exists (select 1 from "tasks" where "tasks"."id" = "task_followers"."task_id")));--> statement-breakpoint
CREATE FUNCTION follow_task(task uuid, person uuid) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO task_followers (task_id, org_id, user_id)
  SELECT id, org_id, person FROM tasks WHERE id = task AND person IS NOT NULL
  ON CONFLICT DO NOTHING
$$;--> statement-breakpoint
-- An unread notification for the same task and reason already says it, so a
-- second one is dropped. Nobody is notified of their own change.
CREATE FUNCTION notify_task(task uuid, people uuid[], reason text) RETURNS void
  LANGUAGE sql
AS $$
  INSERT INTO notifications (task_id, org_id, user_id, reason)
  SELECT tasks.id, tasks.org_id, person, reason
  FROM tasks, unnest(people) AS person
  WHERE tasks.id = task
    AND person IS DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid
  ON CONFLICT DO NOTHING
$$;--> statement-breakpoint
CREATE FUNCTION followers_of(task uuid) RETURNS uuid[]
  LANGUAGE sql STABLE
AS $$
  SELECT array(SELECT user_id FROM task_followers WHERE task_id = task)
$$;--> statement-breakpoint
-- Notifications come from the history, so a change made by a trigger or a job
-- reaches the followers like one made through the API.
CREATE FUNCTION notify_history_entry() RETURNS trigger
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
    PERFORM notify_task(NEW.task_id, ARRAY[assignee], 'assigned');
    PERFORM notify_task(NEW.task_id, array_remove(followers, assignee), 'following');
  ELSE
    PERFORM notify_task(NEW.task_id, followers, 'following');
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER task_history_notify AFTER INSERT ON task_history
  FOR EACH ROW EXECUTE FUNCTION notify_history_entry();--> statement-breakpoint
-- A mention is "@" and the email of someone who can open the board.
CREATE FUNCTION notify_comment() RETURNS trigger
  LANGUAGE plpgsql
AS $$
DECLARE
  followers uuid[] := followers_of(NEW.task_id);
  mentioned uuid[] := array(
    SELECT people.user_id
    FROM tasks
    JOIN boards ON boards.id = tasks.board_id
    CROSS JOIN LATERAL (
      SELECT user_id, email FROM board_members
      WHERE board_id = boards.id AND boards.space_id IS NULL
      UNION ALL
      SELECT user_id, email FROM space_members WHERE space_id = boards.space_id
    ) AS people
    WHERE tasks.id = NEW.task_id
      AND lower(people.email) IN (
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
  PERFORM notify_task(NEW.task_id, mentioned, 'mentioned');
  PERFORM notify_task(NEW.task_id,
    array(SELECT unnest(followers) EXCEPT SELECT unnest(mentioned)), 'following');
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER comments_notify AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION notify_comment();