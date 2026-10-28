CREATE OR REPLACE FUNCTION public.email_notification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO jobs (kind, payload, run_at)
  VALUES ('notification_email', jsonb_build_object(
    'notificationId', NEW.id,
    'userId', NEW.user_id,
    'organizationId', NEW.org_id
  ), now());
  RETURN NULL;
END
$function$;
