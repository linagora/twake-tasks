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
$function$;
