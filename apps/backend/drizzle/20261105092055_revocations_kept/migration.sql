DROP INDEX "oidc_revoked_sessions_expires_at_index";--> statement-breakpoint
ALTER TABLE "oidc_revoked_sessions" ALTER COLUMN "expires_at" DROP NOT NULL;