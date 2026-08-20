CREATE TABLE "attempt_answers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"question_snapshot" jsonb,
	"answer_text" text,
	"transcript" text,
	"audio_storage_path" varchar,
	"answer_started_at" timestamp,
	"answered_at" timestamp,
	"response_duration_seconds" real,
	"automatic_score" real,
	"automatic_feedback" text,
	"automatic_grading_explanation" text,
	"automatic_confidence" varchar,
	"manual_score" real,
	"manual_feedback" text,
	"final_score" real,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_version_id" varchar NOT NULL,
	"question_order" integer NOT NULL,
	"question_text" text NOT NULL,
	"question_type" varchar NOT NULL,
	"expected_answer" text,
	"grading_rubric" text,
	"maximum_points" real DEFAULT 100,
	"difficulty" varchar DEFAULT 'intermediate',
	"topic" varchar,
	"follow_up_rules" jsonb,
	"adaptive_metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" varchar NOT NULL,
	"version_number" integer NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"subject_name" varchar,
	"instructions" text,
	"duration_minutes" integer DEFAULT 30,
	"max_questions" integer DEFAULT 10,
	"passing_score" real DEFAULT 60,
	"total_points" real DEFAULT 0,
	"adaptive_settings" jsonb,
	"grading_settings" jsonb,
	"availability_start" timestamp,
	"availability_end" timestamp,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "grading_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar NOT NULL,
	"answer_id" varchar,
	"professor_id" varchar NOT NULL,
	"previous_score" real,
	"new_score" real,
	"previous_feedback" text,
	"new_feedback" text,
	"change_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "public_exam_code" varchar;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "current_version_id" varchar;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "exam_version_id" varchar;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "student_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "exam_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "percentage_score" real;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "manual_score" real;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "review_status" varchar DEFAULT 'not_reviewed';--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "reviewed_by" varchar;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_public_exam_code_unique" UNIQUE("public_exam_code");