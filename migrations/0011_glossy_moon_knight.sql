ALTER TABLE "exams" ADD COLUMN "max_attempts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint

-- Legacy class-code login stored the generated user ID in guest_student_id.
-- Promote only exact user-ID matches; display names are intentionally ignored.
UPDATE "enrollments" AS e
SET
	"student_id" = e."guest_student_id",
	"updated_at" = now()
FROM "users" AS u
WHERE e."student_id" IS NULL
	AND e."guest_student_id" IS NOT NULL
	AND u."id" = e."guest_student_id";--> statement-breakpoint

-- Preserve every enrollment row while keeping one canonical account membership
-- for each student/class pair so the partial unique index can be added safely.
WITH ranked_enrollments AS (
	SELECT
		"id",
		"student_id",
		row_number() OVER (
			PARTITION BY "student_id", "class_id"
			ORDER BY
				CASE WHEN "status" = 'active' OR "status" IS NULL THEN 0 ELSE 1 END,
				"enrolled_at" NULLS LAST,
				"id"
		) AS membership_rank
	FROM "enrollments"
	WHERE "student_id" IS NOT NULL
)
UPDATE "enrollments" AS e
SET
	"guest_student_id" = COALESCE(e."guest_student_id", ranked_enrollments."student_id"),
	"student_id" = NULL,
	"updated_at" = now()
FROM ranked_enrollments
WHERE e."id" = ranked_enrollments."id"
	AND ranked_enrollments.membership_rank > 1;--> statement-breakpoint

CREATE UNIQUE INDEX "enrollments_student_class_unique" ON "enrollments" USING btree ("student_id","class_id") WHERE "enrollments"."student_id" is not null;--> statement-breakpoint
CREATE INDEX "enrollments_class_id_idx" ON "enrollments" USING btree ("class_id");--> statement-breakpoint
CREATE INDEX "submissions_student_exam_idx" ON "submissions" USING btree ("student_id","exam_id");
