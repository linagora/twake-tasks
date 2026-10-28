CREATE OR REPLACE TRIGGER notifications_email AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION email_notification();
