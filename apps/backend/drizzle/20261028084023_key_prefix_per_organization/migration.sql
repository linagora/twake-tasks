-- A board reusing the prefix of an older board of its organization takes the
-- first free PREFIX2, PREFIX3…, and its tasks keep their former keys for
-- search. Forced row-level security would hide every row from the owner, so
-- it is lifted around the renames. A new prefix is no change of the task:
-- no history entry and no live event.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('boards', 'tasks')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'key_prefix_per_organization must run as the owner of boards and tasks, or as a role that bypasses row-level security: % would see no rows and leave the duplicates in place', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "boards" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" DISABLE TRIGGER "tasks_record_change";--> statement-breakpoint
ALTER TABLE "tasks" DISABLE TRIGGER "tasks_publish_change";--> statement-breakpoint
DO $$
DECLARE
  duplicate record;
  suffix integer;
  candidate text;
BEGIN
  FOR duplicate IN
    SELECT ranked."id", ranked."org_id", ranked."key_prefix"
    FROM (
      SELECT "id", "org_id", "key_prefix", row_number() OVER (
        PARTITION BY "org_id", "key_prefix" ORDER BY "created_at", "id"
      ) AS "rank"
      FROM "boards"
      WHERE "org_id" IS NOT NULL AND NOT "inbox"
    ) ranked
    WHERE ranked."rank" > 1
    ORDER BY ranked."org_id", ranked."key_prefix", ranked."rank"
  LOOP
    suffix := 2;
    LOOP
      candidate := left(duplicate."key_prefix", 10 - length(suffix::text)) || suffix;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "boards"
        WHERE "org_id" = duplicate."org_id"
          AND NOT "inbox"
          AND "key_prefix" = candidate
      );
      suffix := suffix + 1;
    END LOOP;
    UPDATE "tasks"
    SET "previous_keys" = "previous_keys" || (duplicate."key_prefix" || '-' || "number")
    WHERE "board_id" = duplicate."id";
    UPDATE "boards" SET "key_prefix" = candidate WHERE "id" = duplicate."id";
  END LOOP;
END
$$;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE TRIGGER "tasks_publish_change";--> statement-breakpoint
ALTER TABLE "tasks" ENABLE TRIGGER "tasks_record_change";--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "boards_key_prefix_per_organization" ON "boards" ("org_id","key_prefix") WHERE "org_id" is not null and not "inbox";
