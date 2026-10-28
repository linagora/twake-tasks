CREATE OR REPLACE TRIGGER tasks_record_change AFTER INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION record_task_change();
