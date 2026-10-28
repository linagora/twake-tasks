CREATE OR REPLACE TRIGGER task_history_publish AFTER INSERT ON public.task_history FOR EACH ROW EXECUTE FUNCTION publish_history_entry();
