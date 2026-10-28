CREATE OR REPLACE FUNCTION public.followers_of(task uuid)
 RETURNS uuid[]
 LANGUAGE sql
 STABLE
AS $function$
  SELECT array(SELECT user_id FROM task_followers WHERE task_id = task)
$function$;
