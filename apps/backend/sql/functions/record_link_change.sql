CREATE OR REPLACE FUNCTION public.record_link_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  link jsonb := to_jsonb(CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END);
  task uuid := (link ->> 'task_id')::uuid;
BEGIN
  IF TG_ARGV[0] = 'labels' AND current_setting('app.following_labels', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], NULL, link -> TG_ARGV[1]);
  ELSIF EXISTS (SELECT 1 FROM tasks WHERE id = task) THEN
    PERFORM log_task_change(task, link ->> 'org_id', TG_ARGV[0], link -> TG_ARGV[1], NULL);
  END IF;
  RETURN NULL;
END
$function$;
