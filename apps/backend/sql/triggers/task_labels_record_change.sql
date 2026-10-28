CREATE OR REPLACE TRIGGER task_labels_record_change AFTER INSERT OR DELETE ON public.task_labels FOR EACH ROW EXECUTE FUNCTION record_link_change('labels', 'label_id');
