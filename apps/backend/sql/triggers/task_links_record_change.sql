CREATE OR REPLACE TRIGGER task_links_record_change AFTER INSERT OR DELETE ON public.task_links FOR EACH ROW EXECUTE FUNCTION record_dependency_change();
