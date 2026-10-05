-- Turns the signed-in person's invites in their tenant into memberships. A B2C
-- guest cannot see the board yet, so the insert runs under app.membership_lookup
-- (see app_member_board_ids); the invites policy still keeps it to their tenant.
CREATE FUNCTION app_claim_invites() RETURNS void
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  WITH claimed AS (
    DELETE FROM board_invites
    WHERE email = lower(current_setting('app.user_email', true))
    RETURNING board_id, org_id, email, role
  )
  INSERT INTO board_members (board_id, org_id, user_id, email, role)
  SELECT board_id, org_id, nullif(current_setting('app.user_id', true), '')::uuid, email, role
  FROM claimed
  ON CONFLICT (board_id, user_id) DO NOTHING;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
END
$$;
