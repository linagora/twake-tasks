ALTER TABLE "tasks" DROP CONSTRAINT "tasks_board_id_section_id_position_unique";--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_id_unique" UNIQUE("board_id","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_parent_id_section_id_position_unique" UNIQUE NULLS NOT DISTINCT("board_id","parent_id","section_id","position");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_id_parent_id_tasks_board_id_id_fkey" FOREIGN KEY ("board_id","parent_id") REFERENCES "tasks"("board_id","id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_subtask_outside_sections" CHECK ("parent_id" is null or "section_id" is null);--> statement-breakpoint
-- Completing a task completes its open sub-tasks, whatever completed it. Each
-- completed child fires the trigger again, down to the last level.
CREATE FUNCTION complete_subtasks() RETURNS trigger
  LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE tasks SET completed_at = NEW.completed_at
  WHERE board_id = NEW.board_id AND parent_id = NEW.id
    AND completed_at IS NULL AND canceled_at IS NULL;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER tasks_complete_subtasks AFTER UPDATE OF completed_at ON tasks
  FOR EACH ROW WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
  EXECUTE FUNCTION complete_subtasks();