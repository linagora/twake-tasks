-- A file linked to or unlinked from a task is in its history, by the name it
-- had: the link may be gone, and the file renamed in the drive since.
CREATE TRIGGER task_files_record_change AFTER INSERT OR DELETE ON task_files
  FOR EACH ROW EXECUTE FUNCTION record_link_change('files', 'name');
