CREATE OR REPLACE FUNCTION public.without_nulls(object jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM jsonb_each(object) WHERE value <> 'null'::jsonb
$function$;
