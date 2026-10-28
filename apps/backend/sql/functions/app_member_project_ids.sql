CREATE OR REPLACE FUNCTION public.app_member_project_ids()
 RETURNS uuid[]
 LANGUAGE plpgsql
AS $function$
DECLARE
  previous text := current_setting('app.membership_lookup', true);
  ids uuid[];
BEGIN
  PERFORM set_config('app.membership_lookup', 'on', true);
  SELECT coalesce(array_agg(project_id), '{}') INTO ids
  FROM project_members
  WHERE user_id = nullif(current_setting('app.user_id', true), '')::uuid;
  PERFORM set_config('app.membership_lookup', coalesce(previous, ''), true);
  RETURN ids;
END
$function$;
