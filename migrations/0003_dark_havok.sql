ALTER TABLE "exams" ALTER COLUMN "questions" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "responses" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "scores" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ALTER COLUMN "total_score" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "subject_name" varchar;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "max_questions" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "max_follow_ups_per_concept" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "duration_minutes" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "passing_score" real DEFAULT 60;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "show_final_score_immediately" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "status" varchar DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "status" varchar DEFAULT 'completed';--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "current_concept_index" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "adaptive_state" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "question_logs" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "final_score" real;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "topic_scores" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "strengths" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "weaknesses" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "missing_concepts" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "misconceptions" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "recommendations" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "future_suggestions" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "doctor_final_score" real;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "doctor_topic_scores" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "doctor_score_overrides" jsonb DEFAULT '[]'::jsonb;