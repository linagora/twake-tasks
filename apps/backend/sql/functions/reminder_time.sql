CREATE OR REPLACE FUNCTION public.reminder_time(due_date date, due_time time without time zone, due_zone text, zone text, before_minutes integer)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ((due_date + coalesce(due_time, '09:00')) AT TIME ZONE coalesce(due_zone, zone))
    - make_interval(mins => before_minutes)
$function$;
