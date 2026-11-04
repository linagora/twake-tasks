CREATE OR REPLACE TRIGGER notifications_skip_muted BEFORE INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION skip_muted_notification();
