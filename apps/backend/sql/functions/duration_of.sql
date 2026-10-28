CREATE OR REPLACE FUNCTION public.duration_of(task tasks)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN task.duration IS NOT NULL
    THEN jsonb_build_object('amount', task.duration, 'unit', task.duration_unit) END
$function$;
