ALTER TABLE "classes" ADD COLUMN "subject_name" varchar;
ALTER TABLE "classes" ADD COLUMN "course_number" varchar;
ALTER TABLE "classes" ADD COLUMN "section_number" varchar;
ALTER TABLE "classes" ADD COLUMN "created_by_admin_id" varchar;
ALTER TABLE "classes" ADD COLUMN "class_code" varchar;
ALTER TABLE "classes" ADD COLUMN "status" varchar DEFAULT 'active';
ALTER TABLE "classes" ADD COLUMN "updated_at" timestamp DEFAULT now();

UPDATE "classes" SET "subject_name" = "name" WHERE "name" IS NOT NULL;
UPDATE "classes" SET "class_code" = "join_code" WHERE "join_code" IS NOT NULL;

ALTER TABLE "classes" ALTER COLUMN "subject_name" SET NOT NULL;
ALTER TABLE "classes" DROP CONSTRAINT IF EXISTS "classes_join_code_unique";
ALTER TABLE "classes" ADD CONSTRAINT "classes_class_code_unique" UNIQUE("class_code");
ALTER TABLE "classes" DROP COLUMN "name";
ALTER TABLE "classes" DROP COLUMN "join_code";
ALTER TABLE "classes" ALTER COLUMN "professor_id" DROP NOT NULL;

ALTER TABLE "enrollments" ADD COLUMN "guest_student_id" varchar;
ALTER TABLE "enrollments" ADD COLUMN "display_name" varchar;
ALTER TABLE "enrollments" ADD COLUMN "status" varchar DEFAULT 'active';
ALTER TABLE "enrollments" ADD COLUMN "last_accessed_at" timestamp;
ALTER TABLE "enrollments" ADD COLUMN "updated_at" timestamp DEFAULT now();
ALTER TABLE "enrollments" ALTER COLUMN "student_id" DROP NOT NULL;