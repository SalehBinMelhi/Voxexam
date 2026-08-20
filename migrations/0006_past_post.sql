CREATE TABLE "review_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar NOT NULL,
	"student_id" varchar NOT NULL,
	"exam_id" varchar NOT NULL,
	"student_explanation" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"professor_response" text,
	"resolved_at" timestamp,
	"resolved_by_professor_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "auth_provider" SET DEFAULT 'local';