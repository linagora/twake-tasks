CREATE OR REPLACE TRIGGER tasks_publish_change AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION publish_task_change();
