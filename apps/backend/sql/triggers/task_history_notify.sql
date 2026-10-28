CREATE OR REPLACE TRIGGER task_history_notify AFTER INSERT ON public.task_history FOR EACH ROW EXECUTE FUNCTION notify_history_entry();
