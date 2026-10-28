CREATE OR REPLACE FUNCTION public.notify_task(task uuid, people uuid[], reason text, actor uuid, history uuid, comment uuid)
 RETURNS void
 LANGUAGE sql
AS $function$
  INSERT INTO notifications (task_id, org_id, user_id, reason, actor_id, history_id, comment_id)
  SELECT tasks.id, tasks.org_id, person, reason, actor, history, comment
  FROM tasks, unnest(people) AS person
  WHERE tasks.id = task
    AND person IS DISTINCT FROM nullif(current_setting('app.user_id', true), '')::uuid
  ON CONFLICT DO NOTHING
$function$;
