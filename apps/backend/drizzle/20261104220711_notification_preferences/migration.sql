CREATE TYPE "email_frequency" AS ENUM('instant', 'daily', 'never');--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" uuid PRIMARY KEY,
	"muted_in_app" text[] DEFAULT '{}'::text[] NOT NULL,
	"muted_email" text[] DEFAULT '{}'::text[] NOT NULL,
	"email_frequency" "email_frequency" DEFAULT 'instant'::"email_frequency" NOT NULL,
	"unsubscribe_token" uuid DEFAULT gen_random_uuid() NOT NULL UNIQUE
);
--> statement-breakpoint
-- A kind a person turned off in the app is not stored for them, so it is not
-- emailed either. The kinds are those of notificationKind in TypeScript.
CREATE FUNCTION skip_muted_notification() RETURNS trigger
  LANGUAGE plpgsql
AS $$
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
$$;--> statement-breakpoint
CREATE TRIGGER notifications_skip_muted BEFORE INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION skip_muted_notification();
