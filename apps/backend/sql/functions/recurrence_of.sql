CREATE OR REPLACE FUNCTION public.recurrence_of(t tasks)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN t.recur_every IS NULL THEN NULL ELSE jsonb_build_object(
    'every', t.recur_every,
    'unit', t.recur_unit,
    'fromCompletion', t.recur_from_completion
  ) END
$function$;
