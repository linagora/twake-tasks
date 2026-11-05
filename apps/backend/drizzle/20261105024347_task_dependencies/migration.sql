CREATE OR REPLACE FUNCTION public.key_of(task uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT boards.key_prefix || '-' || tasks.number
  FROM tasks JOIN boards ON boards.id = tasks.board_id
  WHERE tasks.id = task
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.log_task_change(task uuid, org text, field text, old jsonb, new jsonb)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO task_history (task_id, org_id, actor_id, actor_email, actor_name, field, "from", "to", name)
  VALUES (
    task, org,
    nullif(current_setting('app.user_id', true), '')::uuid,
    coalesce(current_setting('app.user_email', true), ''),
    (
      SELECT coalesce(us.name, pm.name)
      FROM project_members pm
      LEFT JOIN user_settings us ON us.email = lower(pm.email)
      WHERE pm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      ORDER BY pm.project_id IS NOT DISTINCT FROM (
        SELECT b.project_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = task
      ) DESC
      LIMIT 1
    ),
    field, old, new,
    CASE field
      WHEN 'section' THEN (SELECT name FROM sections WHERE id = (new #>> '{}')::uuid)
      WHEN 'labels' THEN (SELECT name FROM labels WHERE id = (coalesce(new, old) #>> '{}')::uuid)
      WHEN 'assignees' THEN (
        SELECT coalesce(us.name, pm.name, pm.email)
        FROM project_members pm
        LEFT JOIN user_settings us ON us.email = lower(pm.email)
        WHERE pm.user_id = (coalesce(new, old) #>> '{}')::uuid
        ORDER BY pm.project_id IS NOT DISTINCT FROM (
          SELECT b.project_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = task
        ) DESC
        LIMIT 1
      )
      WHEN 'blockedBy' THEN key_of((coalesce(new, old) #>> '{}')::uuid)
      WHEN 'blocks' THEN key_of((coalesce(new, old) #>> '{}')::uuid)
      WHEN 'unblocked' THEN key_of((new #>> '{}')::uuid)
    END
  )
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_dependency_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  link jsonb := to_jsonb(CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END);
  blocking uuid := (link ->> 'blocking_task_id')::uuid;
  blocked uuid := (link ->> 'blocked_task_id')::uuid;
  added boolean := TG_OP = 'INSERT';
BEGIN
  -- A link purged with one of its tasks leaves the other's history alone.
  IF NOT added AND (
    NOT EXISTS (SELECT 1 FROM tasks WHERE id = blocking)
    OR NOT EXISTS (SELECT 1 FROM tasks WHERE id = blocked)
  ) THEN
    RETURN NULL;
  END IF;
  PERFORM log_task_change(blocked, link ->> 'org_id', 'blockedBy',
    CASE WHEN added THEN NULL ELSE to_jsonb(blocking) END,
    CASE WHEN added THEN to_jsonb(blocking) END);
  PERFORM log_task_change(blocking, link ->> 'org_id', 'blocks',
    CASE WHEN added THEN NULL ELSE to_jsonb(blocked) END,
    CASE WHEN added THEN to_jsonb(blocked) END);
  RETURN NULL;
END
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.record_unblocked()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  freed record;
BEGIN
  -- Blockers done in one statement free the task once: the first entry
  -- written in the transaction stands for them all.
  FOR freed IN
    SELECT tasks.id, tasks.org_id
    FROM task_links
    JOIN tasks ON tasks.id = task_links.blocked_task_id
    WHERE task_links.blocking_task_id = NEW.task_id
      AND tasks.completed_at IS NULL AND tasks.canceled_at IS NULL
      AND tasks.archived_at IS NULL AND tasks.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM task_links other
        JOIN tasks blocker ON blocker.id = other.blocking_task_id
        WHERE other.blocked_task_id = tasks.id
          AND blocker.completed_at IS NULL AND blocker.canceled_at IS NULL
          AND blocker.archived_at IS NULL AND blocker.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM task_history
        WHERE task_history.task_id = tasks.id
          AND task_history.field = 'unblocked' AND task_history.at = now()
      )
  LOOP
    PERFORM log_task_change(freed.id, freed.org_id, 'unblocked', NULL, to_jsonb(NEW.task_id));
  END LOOP;
  RETURN NULL;
END
$function$;--> statement-breakpoint
CREATE OR REPLACE TRIGGER task_history_unblock AFTER INSERT ON public.task_history FOR EACH ROW WHEN (((new.field = 'completion'::text) AND (new."from" IS NULL) AND (new."to" IS NOT NULL))) EXECUTE FUNCTION record_unblocked();--> statement-breakpoint
CREATE OR REPLACE TRIGGER task_links_record_change AFTER INSERT OR DELETE ON public.task_links FOR EACH ROW EXECUTE FUNCTION record_dependency_change();
