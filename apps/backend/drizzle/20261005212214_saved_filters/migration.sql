CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"org_id" text,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_filters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_filters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "saved_filters_user_id_index" ON "saved_filters" ("user_id");--> statement-breakpoint
CREATE POLICY "tenant" ON "saved_filters" AS PERMISSIVE FOR ALL TO public USING ("saved_filters"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("saved_filters"."org_id" is not null or "saved_filters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid)) WITH CHECK ("saved_filters"."org_id" is not distinct from nullif(current_setting('app.org_id', true), '') and ("saved_filters"."org_id" is not null or "saved_filters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid));--> statement-breakpoint
CREATE POLICY "own" ON "saved_filters" AS RESTRICTIVE FOR ALL TO public USING ("saved_filters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("saved_filters"."user_id" = nullif(current_setting('app.user_id', true), '')::uuid);