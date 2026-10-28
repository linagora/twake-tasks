CREATE OR REPLACE FUNCTION public.due_of(task tasks)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT to_jsonb(nullif(concat_ws(' ', task.due_date, to_char(task.due_time, 'HH24:MI'), task.due_zone), ''))
$function$;
