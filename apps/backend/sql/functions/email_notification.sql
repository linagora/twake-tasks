CREATE OR REPLACE FUNCTION public.email_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO jobs (kind, task_id, user_id, payload, run_at)
  VALUES ('notification_email', NEW.task_id, NEW.user_id, jsonb_build_object(
    'notificationId', NEW.id,
    'userId', NEW.user_id,
    'organizationId', NEW.org_id
  ), now());
  RETURN NULL;
END
$function$;
