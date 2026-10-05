-- Rows keyed by email cannot be mapped to an entryUUID. TRUNCATE is not subject
-- to row level security, so this empties every organization.
TRUNCATE "boards", "space_members" CASCADE;--> statement-breakpoint
ALTER TABLE "board_members" DROP CONSTRAINT "board_members_pkey";--> statement-breakpoint
ALTER TABLE "space_members" DROP CONSTRAINT "space_members_pkey";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_org_id_owner_email_key_prefix_unique";--> statement-breakpoint
ALTER TABLE "board_favorites" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "board_members" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "space_members" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "board_favorites" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "task_assignees" DROP COLUMN "email";--> statement-breakpoint
ALTER TABLE "board_favorites" ADD PRIMARY KEY ("user_id","board_id");--> statement-breakpoint
ALTER TABLE "board_members" ADD PRIMARY KEY ("board_id","user_id");--> statement-breakpoint
ALTER TABLE "task_assignees" ADD PRIMARY KEY ("task_id","user_id");--> statement-breakpoint
ALTER TABLE "space_members" ADD PRIMARY KEY ("space_id","user_id");--> statement-breakpoint
ALTER TABLE "boards" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_by" SET DATA TYPE uuid USING "created_by"::uuid;--> statement-breakpoint
DROP INDEX "boards_one_inbox_per_owner";--> statement-breakpoint
CREATE UNIQUE INDEX "boards_one_inbox_per_owner" ON "boards" (coalesce("org_id", ''),"owner_id") WHERE "inbox";--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_org_id_owner_id_key_prefix_unique" UNIQUE NULLS NOT DISTINCT("org_id","owner_id","key_prefix");--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_space_or_owner", ADD CONSTRAINT "boards_space_or_owner" CHECK (("space_id" is null) <> ("owner_id" is null));--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_member_board_ids() RETURNS uuid[]
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
  ids uuid[];
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  SELECT coalesce(array_agg(board_id), '{}') INTO ids
  FROM board_members
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
  RETURN ids;
END
$$;--> statement-breakpoint
ALTER POLICY "tenant" ON "boards" TO public USING ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("boards"."org_id" is not null or "boards"."owner_id" = nullif(current_setting('app.user_id', true), '')::uuid or "boards"."id" = any((select app_member_board_ids())::uuid[]))) WITH CHECK ("boards"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("boards"."org_id" is not null or "boards"."owner_id" = nullif(current_setting('app.user_id', true), '')::uuid or "boards"."id" = any((select app_member_board_ids())::uuid[])));--> statement-breakpoint
ALTER TABLE "boards" DROP COLUMN "owner_email";