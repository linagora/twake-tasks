CREATE TYPE "view_grouping" AS ENUM('status', 'board', 'assignee', 'priority', 'label', 'due');--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "layout" "board_layout" DEFAULT 'list'::"board_layout" NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "group_by" "view_grouping" DEFAULT 'status'::"view_grouping" NOT NULL;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD COLUMN "all_columns" boolean DEFAULT false NOT NULL;