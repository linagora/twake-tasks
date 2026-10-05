-- Sent on commit, to the replicas streaming the board's changes.
CREATE FUNCTION notify_board_change() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('board_changes', NEW.id || ' ' || NEW.version);
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER boards_notify_change AFTER UPDATE OF version ON boards
  FOR EACH ROW WHEN (NEW.version IS DISTINCT FROM OLD.version)
  EXECUTE FUNCTION notify_board_change();
