CREATE OR REPLACE FUNCTION public.completion_of(completed timestamp with time zone, canceled timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN completed IS NOT NULL THEN '"completed"'::jsonb
    WHEN canceled IS NOT NULL THEN '"canceled"'::jsonb
  END
$function$;
