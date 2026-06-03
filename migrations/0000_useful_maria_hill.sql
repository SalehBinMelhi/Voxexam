CREATE TABLE "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"support_request_id" varchar NOT NULL,
	"sender_id" varchar NOT NULL,
	"sender_role" varchar NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "class_materials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" varchar NOT NULL,
	"professor_id" varchar NOT NULL,
	"file_name" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"university_id" varchar,
	"professor_id" varchar NOT NULL,
	"roster" jsonb DEFAULT '[]'::jsonb,
	"join_code" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "classes_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"class_id" varchar NOT NULL,
	"enrolled_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar NOT NULL,
	"professor_id" varchar NOT NULL,
	"class_id" varchar,
	"questions" jsonb NOT NULL,
	"start_time" varchar,
	"end_time" varchar,
	"assigned_student_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_student_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"access_code" varchar,
	"access_code_expires_at" timestamp,
	"mode" varchar DEFAULT 'exam' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "exams_access_code_unique" UNIQUE("access_code")
);
--> statement-breakpoint
CREATE TABLE "practice_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"source_type" text NOT NULL,
	"source_summary" text,
	"session_mode" text NOT NULL,
	"coach_style" text DEFAULT 'normal' NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb,
	"overall_readiness_score" real,
	"overall_vox_score_profile" jsonb,
	"concept_coverage_map" jsonb,
	"language_used" text,
	"completed_question_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" varchar NOT NULL,
	"student_id" varchar NOT NULL,
	"responses" jsonb NOT NULL,
	"scores" jsonb NOT NULL,
	"understanding_scores" jsonb,
	"grading_methods" jsonb,
	"total_score" real NOT NULL,
	"total_understanding_score" real,
	"feedback" jsonb,
	"is_preview" varchar DEFAULT 'false',
	"screen_recording_url" varchar,
	"webcam_recording_url" varchar,
	"proctoring_flags" jsonb,
	"tab_switch_count" real DEFAULT 0,
	"is_suspicious" varchar DEFAULT 'false',
	"quickvox_insight" text,
	"quickvox_follow_up" text,
	"vox_score_profile" jsonb,
	"professor_vox_score_profile" jsonb,
	"professor_decision" text,
	"professor_override_reason" text,
	"professor_holistic_score" real,
	"professor_review_timestamp" timestamp,
	"professor_review_duration_minutes" real,
	"grading_gap" real,
	"arabic_flag" boolean,
	"asr_confidence_level" text,
	"asr_estimated_wer" text,
	"critical_concept_error_flag" boolean,
	"language_used" text,
	"answer_duration_seconds" real,
	"estimated_word_count" integer,
	"submitted_at" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"user_name" varchar,
	"user_role" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"message" varchar,
	"page_url" varchar,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar NOT NULL,
	"domain" varchar,
	"openai_api_key" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar,
	"university_id" varchar,
	"openai_api_key" varchar,
	"auth_provider" varchar DEFAULT 'replit',
	"student_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");