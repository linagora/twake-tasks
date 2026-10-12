-- Labels that differ only by case merge into the oldest one before the index
-- goes in. Forced row-level security would hide every row from the owner, so
-- it is lifted around the merge. Nobody labeled anything, so the merge leaves
-- no task history.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = current_user AND (rolsuper OR rolbypassrls)
  ) AND EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename IN ('labels', 'task_labels')
      AND tableowner <> current_user
  ) THEN
    RAISE EXCEPTION 'labels_name_any_case must run as the owner of labels and task_labels, or as a role that bypasses row-level security: % would see no rows and leave the duplicates in place', current_user;
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "labels" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels" DISABLE TRIGGER "task_labels_record_change";--> statement-breakpoint
CREATE TEMPORARY TABLE "label_merges" AS
SELECT "id", first_value("id") OVER (
  PARTITION BY "project_id", lower("name") ORDER BY "id"
) AS "keeper"
FROM "labels";--> statement-breakpoint
INSERT INTO "task_labels" ("task_id", "label_id", "org_id")
SELECT tl."task_id", m."keeper", tl."org_id"
FROM "task_labels" tl
JOIN "label_merges" m ON m."id" = tl."label_id"
WHERE m."id" <> m."keeper"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "labels" l
USING "label_merges" m
WHERE m."id" = l."id" AND m."id" <> m."keeper";--> statement-breakpoint
DROP TABLE "label_merges";--> statement-breakpoint
ALTER TABLE "task_labels" ENABLE TRIGGER "task_labels_record_change";--> statement-breakpoint
ALTER TABLE "labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_labels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "labels" DROP CONSTRAINT "labels_project_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "labels_project_id_lower_name_index" ON "labels" ("project_id",lower("name"));
