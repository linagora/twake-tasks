-- Every notification is also emailed, by a job, so a failing mail server only
-- delays the email.
CREATE FUNCTION email_notification() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO jobs (kind, payload, run_at)
  VALUES ('notification_email', jsonb_build_object(
    'notificationId', NEW.id,
    'userId', NEW.user_id,
    'organizationId', NEW.org_id
  ), now());
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER notifications_email AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION email_notification();
