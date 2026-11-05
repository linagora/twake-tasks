CREATE OR REPLACE TRIGGER boards_delete_cover AFTER DELETE OR UPDATE OF background_image ON public.boards FOR EACH ROW EXECUTE FUNCTION delete_cover();
