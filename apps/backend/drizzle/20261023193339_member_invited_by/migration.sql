ALTER TABLE "project_members" ADD COLUMN "invited_by" uuid;--> statement-breakpoint
-- The membership keeps who invited the person, so their boards can say who shared them.
CREATE OR REPLACE FUNCTION app_claim_invites() RETURNS SETOF uuid
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  RETURN QUERY
  WITH claimed AS (
    DELETE FROM project_invites
    WHERE email = lower(current_setting('app.user_email', true))
    RETURNING project_id, org_id, email, role, invited_by
  )
  INSERT INTO project_members (project_id, org_id, user_id, email, role, invited_by)
  SELECT project_id, org_id, nullif(current_setting('app.user_id', true), '')::uuid, email, role, invited_by
  FROM claimed
  ON CONFLICT (project_id, user_id) DO NOTHING
  RETURNING project_members.project_id;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
END
$$;
