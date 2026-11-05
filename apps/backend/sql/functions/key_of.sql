CREATE OR REPLACE FUNCTION public.key_of(task uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT boards.key_prefix || '-' || tasks.number
  FROM tasks JOIN boards ON boards.id = tasks.board_id
  WHERE tasks.id = task
$function$;
