-- The app role owns its tables, so the policies only bind it when forced.
ALTER TABLE "spaces" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "space_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "boards" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_assignees" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_favorites" FORCE ROW LEVEL SECURITY;
