-- Turns the signed-in person's invites in their tenant into memberships. A B2C
-- guest cannot see the project yet, so the insert runs under app.membership_lookup
-- (see app_member_project_ids); the invites policy still keeps it to their tenant.
-- Returns the projects joined, so their open boards can be told of the new member.
DROP FUNCTION app_claim_invites();--> statement-breakpoint
CREATE FUNCTION app_claim_invites() RETURNS SETOF uuid
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
    RETURNING project_id, org_id, email, role
  )
  INSERT INTO project_members (project_id, org_id, user_id, email, role)
  SELECT project_id, org_id, nullif(current_setting('app.user_id', true), '')::uuid, email, role
  FROM claimed
  ON CONFLICT (project_id, user_id) DO NOTHING
  RETURNING project_members.project_id;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
END
$$;
