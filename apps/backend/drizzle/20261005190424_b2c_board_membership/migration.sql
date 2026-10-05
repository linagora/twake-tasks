-- Policies call this as an uncorrelated subquery, so it runs once per statement.
-- app.membership_lookup lets the board_members policy skip its board check while
-- this reads the table, which would otherwise recurse through the boards policy.
-- A function SET clause would restore the flag, but needs a superuser for a custom setting.
CREATE FUNCTION app_member_board_ids() RETURNS uuid[]
  LANGUAGE plpgsql
AS $$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
  ids uuid[];
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  SELECT coalesce(array_agg(board_id), '{}') INTO ids
  FROM board_members
  WHERE email = nullif(current_setting('app.email', true), '');
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
  RETURN ids;
END
$$;
