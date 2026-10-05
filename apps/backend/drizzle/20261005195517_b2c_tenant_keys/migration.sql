ALTER TABLE "board_favorites" DROP CONSTRAINT "board_favorites_org_id_board_id_boards_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "board_members" DROP CONSTRAINT "board_members_org_id_board_id_boards_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "sections" DROP CONSTRAINT "sections_org_id_board_id_boards_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "task_assignees" DROP CONSTRAINT "task_assignees_org_id_task_id_tasks_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_org_id_board_id_boards_org_id_id_fkey";--> statement-breakpoint
ALTER TABLE "boards" DROP CONSTRAINT "boards_org_id_id_unique";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_org_id_id_unique";--> statement-breakpoint
ALTER TABLE "board_favorites" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "board_members" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "sections" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "tenant" text GENERATED ALWAYS AS (coalesce(org_id, '')) STORED;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_tenant_id_unique" UNIQUE("tenant","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_unique" UNIQUE("tenant","id");--> statement-breakpoint
ALTER TABLE "board_favorites" ADD CONSTRAINT "board_favorites_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_tenant_task_id_tasks_tenant_id_fkey" FOREIGN KEY ("tenant","task_id") REFERENCES "tasks"("tenant","id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_board_id_boards_tenant_id_fkey" FOREIGN KEY ("tenant","board_id") REFERENCES "boards"("tenant","id");