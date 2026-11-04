CREATE OR REPLACE FUNCTION public.skip_muted_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM notification_preferences
    WHERE user_id = NEW.user_id
      AND CASE NEW.reason
        WHEN 'unassigned' THEN 'assigned'
        WHEN 'following' THEN CASE WHEN NEW.comment_id IS NULL THEN 'changes' ELSE 'comments' END
        ELSE NEW.reason
      END = ANY(muted_in_app)
  ) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END
$function$;
