-- ALTER TABLE "classes" RENAME COLUMN "join_code" TO "course_number";--> statement-breakpoint
-- ALTER TABLE "classes" RENAME COLUMN "name" TO "section_number";--> statement-breakpoint
-- ALTER TABLE "classes" DROP CONSTRAINT "classes_join_code_unique";--> statement-breakpoint
-- ALTER TABLE "classes" ALTER COLUMN "professor_id" DROP NOT NULL;--> statement-breakpoint
-- ALTER TABLE "enrollments" ALTER COLUMN "student_id" DROP NOT NULL;--> statement-breakpoint
-- ALTER TABLE "classes" ADD COLUMN "subject_name" varchar NOT NULL;--> statement-breakpoint
-- ALTER TABLE "classes" ADD COLUMN "created_by_admin_id" varchar;--> statement-breakpoint
-- ALTER TABLE "classes" ADD COLUMN "class_code" varchar;--> statement-breakpoint
-- ALTER TABLE "classes" ADD COLUMN "status" varchar DEFAULT 'active';--> statement-breakpoint
-- ALTER TABLE "classes" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
-- ALTER TABLE "enrollments" ADD COLUMN "guest_student_id" varchar;--> statement-breakpoint
-- ALTER TABLE "enrollments" ADD COLUMN "display_name" varchar;--> statement-breakpoint
-- ALTER TABLE "enrollments" ADD COLUMN "status" varchar DEFAULT 'active';--> statement-breakpoint
-- ALTER TABLE "enrollments" ADD COLUMN "last_accessed_at" timestamp;--> statement-breakpoint
-- ALTER TABLE "enrollments" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
-- ALTER TABLE "exams" ADD COLUMN "processing_method" varchar;--> statement-breakpoint
-- ALTER TABLE "exams" ADD COLUMN "page_count" integer;--> statement-breakpoint
-- ALTER TABLE "exams" ADD COLUMN "processing_status" varchar;--> statement-breakpoint
-- ALTER TABLE "exams" ADD COLUMN "processing_error" text;--> statement-breakpoint
-- ALTER TABLE "classes" ADD CONSTRAINT "classes_class_code_unique" UNIQUE("class_code");

ALTER TABLE "exams"
ADD COLUMN IF NOT EXISTS "processing_method" varchar;
--> statement-breakpoint

ALTER TABLE "exams"
ADD COLUMN IF NOT EXISTS "page_count" integer;
--> statement-breakpoint

ALTER TABLE "exams"
ADD COLUMN IF NOT EXISTS "processing_status" varchar;
--> statement-breakpoint

ALTER TABLE "exams"
ADD COLUMN IF NOT EXISTS "processing_error" text;