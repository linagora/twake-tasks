CREATE OR REPLACE TRIGGER task_reminders_unschedule AFTER DELETE ON public.task_reminders FOR EACH ROW EXECUTE FUNCTION unschedule_reminder();
