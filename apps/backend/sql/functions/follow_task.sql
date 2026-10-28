CREATE OR REPLACE FUNCTION public.follow_task(task uuid, person uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO task_followers (task_id, org_id, user_id)
  SELECT id, org_id, person FROM tasks WHERE id = task AND person IS NOT NULL
  ON CONFLICT DO NOTHING
$function$;
