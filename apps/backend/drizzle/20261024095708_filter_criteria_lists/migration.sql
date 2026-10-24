-- Each criterion of a saved filter now holds a list of values, any of which
-- matches, so every single value becomes a list of one. Forced row-level
-- security would hide every row from the owner, so it is lifted around the
-- update.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = 'saved_filters'
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'filter_criteria_lists must run as the owner of saved_filters, or as a role that bypasses row-level security: % would see no rows and leave every filter with single values', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "saved_filters" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "saved_filters" SET "criteria" = (
  SELECT jsonb_object_agg(
    "key",
    CASE WHEN jsonb_typeof("value") = 'array' THEN "value"
      ELSE jsonb_build_array("value") END
  )
  FROM jsonb_each("criteria")
)
WHERE "criteria" <> '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "saved_filters" FORCE ROW LEVEL SECURITY;
