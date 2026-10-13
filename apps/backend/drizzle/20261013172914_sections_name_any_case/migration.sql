-- Sections of a board that differ only by case keep the first one's name and
-- the others get a number, so no task moves. Forced row-level security would
-- hide every row from the owner, so it is lifted around the rename.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename = 'sections'
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'sections_name_any_case must run as the owner of sections, or as a role that bypasses row-level security: % would see no rows and leave the duplicates in place', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "sections" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
DECLARE
  dup record;
  n integer;
BEGIN
  FOR dup IN
    SELECT "id", "board_id", "name" FROM (
      SELECT "id", "board_id", "name", "position",
        row_number() OVER (
          PARTITION BY "board_id", lower("name") ORDER BY "position", "id"
        ) AS "rank"
      FROM "sections"
    ) ranked
    WHERE "rank" > 1
    ORDER BY "board_id", "position", "id"
  LOOP
    n := 2;
    WHILE EXISTS (
      SELECT 1 FROM "sections"
      WHERE "board_id" = dup."board_id"
        AND lower("name") = lower(dup."name" || ' (' || n || ')')
    ) LOOP
      n := n + 1;
    END LOOP;
    UPDATE "sections" SET "name" = dup."name" || ' (' || n || ')'
    WHERE "id" = dup."id";
  END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "sections_board_id_lower_name_index" ON "sections" ("board_id",lower("name"));
