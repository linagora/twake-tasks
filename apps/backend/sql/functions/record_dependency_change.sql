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
$function$;
