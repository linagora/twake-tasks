CREATE OR REPLACE TRIGGER comments_notify AFTER INSERT ON public.comments FOR EACH ROW EXECUTE FUNCTION notify_comment();
