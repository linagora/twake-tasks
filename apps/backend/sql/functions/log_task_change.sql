CREATE OR REPLACE FUNCTION public.log_task_change(task uuid, org text, field text, old jsonb, new jsonb)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO task_history (task_id, org_id, actor_id, actor_email, actor_name, field, "from", "to", name)
  VALUES (
    task, org,
    nullif(current_setting('app.user_id', true), '')::uuid,
    coalesce(current_setting('app.user_email', true), ''),
    (
      SELECT coalesce(us.name, pm.name)
      FROM project_members pm
      LEFT JOIN user_settings us ON us.email = lower(pm.email)
      WHERE pm.user_id = nullif(current_setting('app.user_id', true), '')::uuid
      ORDER BY pm.project_id IS NOT DISTINCT FROM (
        SELECT b.project_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = task
      ) DESC
      LIMIT 1
    ),
    field, old, new,
    CASE field
      WHEN 'section' THEN (SELECT name FROM sections WHERE id = (new #>> '{}')::uuid)
      WHEN 'labels' THEN (SELECT name FROM labels WHERE id = (coalesce(new, old) #>> '{}')::uuid)
      WHEN 'assignees' THEN (
        SELECT coalesce(us.name, pm.name, pm.email)
        FROM project_members pm
        LEFT JOIN user_settings us ON us.email = lower(pm.email)
        WHERE pm.user_id = (coalesce(new, old) #>> '{}')::uuid
        ORDER BY pm.project_id IS NOT DISTINCT FROM (
          SELECT b.project_id FROM tasks t JOIN boards b ON b.id = t.board_id WHERE t.id = task
        ) DESC
        LIMIT 1
      )
    END
  )
$function$;
