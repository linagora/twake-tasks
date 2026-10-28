CREATE OR REPLACE TRIGGER task_assignees_record_change AFTER INSERT OR DELETE ON public.task_assignees FOR EACH ROW EXECUTE FUNCTION record_link_change('assignees', 'user_id');
