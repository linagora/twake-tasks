CREATE OR REPLACE FUNCTION public.delete_cover()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.background_image IS NOT NULL AND (
    TG_OP = 'DELETE' OR NEW.background_image IS DISTINCT FROM OLD.background_image
  ) THEN
    INSERT INTO jobs (kind, payload, run_at)
    VALUES ('cover_delete', jsonb_build_object('imageId', OLD.background_image), now());
  END IF;
  RETURN NULL;
END
$function$;
