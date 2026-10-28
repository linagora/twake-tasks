CREATE OR REPLACE FUNCTION public.publish_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.board_id IS DISTINCT FROM OLD.board_id OR NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    PERFORM publish_task_event(NEW.id, 'moved', jsonb_build_object('changes', without_nulls(jsonb_build_object(
      'board', CASE WHEN NEW.board_id IS DISTINCT FROM OLD.board_id
        THEN jsonb_build_object('from', OLD.board_id, 'to', NEW.board_id) END,
      'section', jsonb_build_object('from', OLD.section_id, 'to', NEW.section_id)
    ))));
  END IF;
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    PERFORM publish_task_event(NEW.id, 'deleted', '{}');
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    PERFORM publish_task_event(NEW.id, 'restored', '{}');
  END IF;
  RETURN NULL;
END
$function$;
