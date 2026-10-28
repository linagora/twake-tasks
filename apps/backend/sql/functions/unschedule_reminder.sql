CREATE OR REPLACE FUNCTION public.unschedule_reminder()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  DELETE FROM jobs WHERE key = 'reminder:' || OLD.id;
  RETURN NULL;
END
$function$;
