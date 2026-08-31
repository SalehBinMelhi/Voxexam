import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDENT_EXAM_VISIBLE_LIMIT,
  shouldScrollStudentExamFrame,
  studentClassLeaveLabel,
  studentExamFrameItems,
} from "../client/src/lib/student-dashboard-utils.ts";

test("builds a leave label for every class, including classes with the same name", () => {
  const classes = [
    { id: "class-a", name: "Biology" },
    { id: "class-b", name: "Biology" },
    { id: "class-c", name: "Chemistry" },
  ];

  const labels = classes.map((studentClass) => studentClassLeaveLabel(studentClass.name));

  assert.equal(labels.length, classes.length);
  assert.deepEqual(labels, ["Leave Biology", "Leave Biology", "Leave Chemistry"]);
});

test("trims class names and uses a safe fallback for blank or missing names", () => {
  assert.equal(studentClassLeaveLabel("  Computer Science  "), "Leave Computer Science");
  assert.equal(studentClassLeaveLabel(""), "Leave this class");
  assert.equal(studentClassLeaveLabel("   "), "Leave this class");
  assert.equal(studentClassLeaveLabel(null), "Leave this class");
  assert.equal(studentClassLeaveLabel(undefined), "Leave this class");
});

test("enables scrolling only when the exam count exceeds the visible limit", () => {
  assert.equal(STUDENT_EXAM_VISIBLE_LIMIT, 4);
  assert.equal(shouldScrollStudentExamFrame(0), false);
  assert.equal(shouldScrollStudentExamFrame(4), false);
  assert.equal(shouldScrollStudentExamFrame(5), true);
});

test("scroll policy preserves every exam ID instead of slicing the list", () => {
  const examIds = ["exam-1", "exam-2", "exam-3", "exam-4", "exam-5", "exam-6"] as const;
  const frameItems = studentExamFrameItems(examIds);

  assert.equal(shouldScrollStudentExamFrame(frameItems.length), true);
  assert.deepEqual(frameItems, examIds);
  assert.equal(frameItems.length, examIds.length);
  assert.notStrictEqual(frameItems, examIds);
});
