CREATE TYPE "board_background" AS ENUM('orbitalblue', 'earlymorning', 'dawn', 'stellarburst', 'eclipse', 'stripes', 'custom');--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "background" "board_background";--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "background_color" text;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "background_image" uuid;--> statement-breakpoint
-- The picture lives in object storage, which no transaction reaches: a job
-- deletes it once the board dropped it, also when a deleted project cascades.
CREATE FUNCTION delete_cover() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.background_image IS NOT NULL AND (
    TG_OP = 'DELETE' OR NEW.background_image IS DISTINCT FROM OLD.background_image
  ) THEN
    INSERT INTO jobs (kind, payload, run_at)
    VALUES ('cover_delete', jsonb_build_object('imageId', OLD.background_image), now());
  END IF;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER boards_delete_cover AFTER DELETE OR UPDATE OF background_image ON boards
  FOR EACH ROW EXECUTE FUNCTION delete_cover();