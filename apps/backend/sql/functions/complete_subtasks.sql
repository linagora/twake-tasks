CREATE OR REPLACE FUNCTION public.complete_subtasks()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE tasks SET completed_at = NEW.completed_at
  WHERE board_id = NEW.board_id AND parent_id = NEW.id
    AND completed_at IS NULL AND canceled_at IS NULL;
  RETURN NULL;
END
$function$;
