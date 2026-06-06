ALTER TABLE "practice_sessions" ADD COLUMN "consent_given" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "practice_sessions" ADD COLUMN "consent_timestamp" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "consent_given" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "consent_timestamp" timestamp;