import assert from "node:assert/strict";
import test from "node:test";
import type { Exam, ExamSubmission } from "@shared/schema";
import {
  buildImmediateAdaptiveDiagnosticReport,
  buildStudentExamSummary,
  buildStudentHistoryItem,
  canStudentAccessExam,
  dedupeAndSortStudentExams,
  hasStudentMembership,
  leaveStudentClassMembership,
  normalizeAccessCode,
  sanitizeExamForStudent,
  studentOwnsAttempt,
  validateAttemptLimit,
  validateExamCodeExpiry,
  validateExamWindow,
  validateNewAttemptCreation,
} from "./student-experience.ts";

const now = new Date("2026-08-30T10:00:00.000Z");

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "exam-1",
    title: "Secure Oral Exam",
    description: "Foundations",
    subjectName: "Computer Science",
    professorId: "professor-1",
    classId: "class-1",
    questions: [{ id: "q-1", text: "Explain TCP.", type: "short", correctAnswer: "A transport protocol" }],
    blueprint: null,
    materialSummary: null,
    processingMethod: null,
    pageCount: null,
    processingStatus: null,
    processingError: null,
    maxQuestions: 1,
    maxFollowUpsPerConcept: 0,
    durationMinutes: 30,
    passingScore: 60,
    showFinalScoreImmediately: true,
    maxAttempts: 1,
    status: "active",
    startTime: "2026-08-30T09:00:00.000Z",
    endTime: "2026-08-30T11:00:00.000Z",
    assignedStudentIds: [],
    assignedStudentNames: ["A name must never authorize access"],
    accessCode: "ABC12",
    publicExamCode: "ABC12",
    accessCodeExpiresAt: new Date("2026-08-30T11:00:00.000Z"),
    mode: "exam",
    currentVersionId: null,
    createdAt: now,
    publishedAt: now,
    archivedAt: null,
    ...overrides,
  };
}

function submission(overrides: Partial<ExamSubmission> = {}): ExamSubmission {
  return {
    id: "attempt-1",
    examId: "exam-1",
    examVersionId: null,
    studentId: "student-1",
    studentSnapshot: null,
    examSnapshot: null,
    startedAt: now,
    responses: [],
    scores: {},
    understandingScores: null,
    gradingMethods: null,
    totalScore: 0.82,
    percentageScore: 82,
    manualScore: null,
    reviewStatus: "not_reviewed",
    reviewedBy: null,
    reviewedAt: null,
    totalUnderstandingScore: null,
    feedback: null,
    status: "completed",
    currentConceptIndex: 0,
    adaptiveState: null,
    questionLogs: [],
    finalScore: null,
    topicScores: null,
    strengths: [],
    weaknesses: [],
    missingConcepts: [],
    misconceptions: [],
    recommendations: [],
    futureSuggestions: [],
    doctorFinalScore: null,
    doctorTopicScores: null,
    doctorScoreOverrides: [],
    isPreview: "false",
    screenRecordingUrl: null,
    webcamRecordingUrl: null,
    proctoringUploadStatus: null,
    proctoringUploadError: null,
    proctoringFlags: null,
    tabSwitchCount: 0,
    isSuspicious: "false",
    quickvoxInsight: null,
    quickvoxFollowUp: null,
    voxScoreProfile: null,
    professorVoxScoreProfile: null,
    professorDecision: null,
    professorOverrideReason: null,
    professorHolisticScore: null,
    professorReviewTimestamp: null,
    professorReviewDurationMinutes: null,
    gradingGap: null,
    arabicFlag: null,
    consentGiven: true,
    consentTimestamp: now,
    asrConfidenceLevel: null,
    asrEstimatedWer: null,
    criticalConceptErrorFlag: null,
    languageUsed: null,
    answerDurationSeconds: null,
    estimatedWordCount: null,
    submittedAt: "2026-08-30T10:30:00.000Z",
    ...overrides,
  };
}

test("normalizes codes and rejects invalid, inactive, upcoming, closed, and expired access", () => {
  assert.equal(normalizeAccessCode("  abC12  "), "ABC12");
  assert.equal(normalizeAccessCode(null), "");
  assert.equal(validateExamWindow(exam(), now).allowed, true);
  assert.equal(validateExamWindow(exam({ status: "inactive" }), now).error, "This exam is closed.");
  assert.equal(validateExamWindow(exam({ startTime: "2026-08-30T10:30:00.000Z" }), now).error, "This exam has not started yet.");
  assert.equal(validateExamWindow(exam({ endTime: "2026-08-30T09:30:00.000Z" }), now).error, "This exam is closed.");
  assert.equal(validateExamCodeExpiry(exam({ accessCodeExpiresAt: new Date("2026-08-30T09:59:00.000Z") }), now).status, 410);
});

test("authorizes only membership, explicit assignment, or a validated direct-code grant", () => {
  const base = exam();
  assert.equal(canStudentAccessExam({ exam: base, examId: base.id, studentId: "student-1", enrolledClassIds: new Set(["class-1"]) }), true);
  assert.equal(canStudentAccessExam({ exam: base, examId: base.id, studentId: "student-1", enrolledClassIds: new Set() }), false);
  assert.equal(canStudentAccessExam({ exam: exam({ assignedStudentIds: ["student-1"] }), examId: base.id, studentId: "student-1", enrolledClassIds: new Set() }), true);
  assert.equal(canStudentAccessExam({ exam: base, examId: base.id, studentId: "student-1", enrolledClassIds: new Set(), directGrantExamIds: new Set([base.id]) }), true);
});

test("recognizes a valid class membership, rejects a different class, and keeps repeated joins idempotent", () => {
  const memberships = [{ classId: "class-1", status: "active" }];
  assert.equal(hasStudentMembership(memberships, "class-1"), true);
  assert.equal(hasStudentMembership(memberships, "invalid-class"), false);
  assert.equal(hasStudentMembership([...memberships, ...memberships], "class-1"), true);
  assert.equal(hasStudentMembership([{ classId: "class-1", status: "inactive" }], "class-1"), false);
});

test("lists class exams only when the authenticated student has an authorized relationship", () => {
  const candidates = [
    exam({ id: "member-exam", classId: "class-1" }),
    exam({ id: "other-class-exam", classId: "class-2" }),
    exam({ id: "assigned-exam", classId: null, assignedStudentIds: ["student-1"] }),
  ];
  const visibleIds = candidates
    .filter((candidate) => canStudentAccessExam({
      exam: candidate,
      examId: candidate.id,
      studentId: "student-1",
      enrolledClassIds: new Set(["class-1"]),
    }))
    .map((candidate) => candidate.id);

  assert.deepEqual(visibleIds, ["member-exam", "assigned-exam"]);
});

test("enforces attempt limits while allowing an owned in-progress attempt to resume", () => {
  assert.equal(validateAttemptLimit(exam(), []).allowed, true);
  assert.equal(validateAttemptLimit(exam(), [submission()]).error, "You have used all allowed attempts.");
  assert.equal(validateAttemptLimit(exam(), [submission({ status: "in_progress" })]).allowed, true);
  assert.equal(
    validateNewAttemptCreation(exam(), [submission({ status: "in_progress" })]).error,
    "An exam attempt is already in progress.",
  );
  assert.equal(
    validateNewAttemptCreation(exam({ maxAttempts: 2 }), [submission()]).allowed,
    true,
  );
  assert.equal(studentOwnsAttempt("student-1", submission()), true);
  assert.equal(studentOwnsAttempt("student-2", submission()), false);
  assert.equal(studentOwnsAttempt("student-1", submission({ isPreview: "true" })), false);
});

test("student exam payload omits answer keys", () => {
  const safe = sanitizeExamForStudent(exam());
  assert.equal(safe.questions.length, 1);
  assert.equal("correctAnswer" in safe.questions[0], false);
});

test("server-derived cards represent upcoming, available, resumable, pending, and published states", () => {
  const classExam = buildStudentExamSummary({ exam: exam(), attempts: [], className: "CS", professorName: "Professor One", now });
  assert.equal(classExam.action, "start");
  assert.equal(classExam.classId, "class-1");
  assert.equal(buildStudentExamSummary({ exam: exam({ classId: null }), attempts: [], className: null, professorName: "Professor One", now }).classId, null);
  assert.equal(buildStudentExamSummary({ exam: exam({ startTime: "2026-08-30T12:00:00.000Z" }), attempts: [], className: null, professorName: null, now }).action, "opens_at");
  assert.equal(buildStudentExamSummary({ exam: exam(), attempts: [submission({ status: "in_progress" })], className: null, professorName: null, now }).action, "continue");
  assert.equal(buildStudentExamSummary({ exam: exam(), attempts: [submission()], className: null, professorName: null, now }).action, "pending_review");
  assert.equal(buildStudentExamSummary({ exam: exam(), attempts: [submission({ professorDecision: "accepted" })], className: null, professorName: null, now }).action, "view_result");
  assert.equal(
    buildStudentExamSummary({
      exam: exam({ maxAttempts: 2 }),
      attempts: [submission()],
      className: null,
      professorName: null,
      now,
    }).canStartAnotherAttempt,
    true,
  );
});

test("deduplicates and sorts student exams without mutating the caller's list", () => {
  const available = buildStudentExamSummary({
    exam: exam({ id: "available", startTime: "2026-08-30T09:30:00.000Z" }),
    attempts: [],
    className: "CS",
    professorName: "Professor One",
    now,
  });
  const upcoming = buildStudentExamSummary({
    exam: exam({ id: "upcoming", startTime: "2026-08-30T10:30:00.000Z" }),
    attempts: [],
    className: "CS",
    professorName: "Professor One",
    now,
  });
  const submitted = buildStudentExamSummary({
    exam: exam({ id: "submitted" }),
    attempts: [submission({ id: "submitted-attempt", examId: "submitted" })],
    className: "CS",
    professorName: "Professor One",
    now,
  });
  const published = buildStudentExamSummary({
    exam: exam({ id: "published" }),
    attempts: [submission({ id: "published-attempt", examId: "published", professorDecision: "accepted" })],
    className: "CS",
    professorName: "Professor One",
    now,
  });
  const closed = buildStudentExamSummary({
    exam: exam({ id: "closed", status: "inactive" }),
    attempts: [],
    className: "CS",
    professorName: "Professor One",
    now,
  });
  const input = [closed, published, submitted, upcoming, available, { ...available }];
  const originalIds = input.map((item) => item.id);

  const result = dedupeAndSortStudentExams(input, now);

  assert.deepEqual(result.map((item) => item.id), [
    "available",
    "upcoming",
    "submitted",
    "published",
    "closed",
  ]);
  assert.deepEqual(input.map((item) => item.id), originalIds);
  assert.notEqual(result, input);
  assert.equal(result[0], available);
});

test("sorts equal-priority exams by nearest start date and then stable ID", () => {
  const summaries = [
    exam({ id: "upcoming-far", startTime: "2026-08-30T13:00:00.000Z" }),
    exam({ id: "upcoming-near-b", startTime: "2026-08-30T10:30:00.000Z" }),
    exam({ id: "upcoming-near-a", startTime: "2026-08-30T10:30:00.000Z" }),
  ].map((candidate) => buildStudentExamSummary({
    exam: candidate,
    attempts: [],
    className: "CS",
    professorName: "Professor One",
    now,
  }));

  assert.deepEqual(dedupeAndSortStudentExams(summaries, now).map((item) => item.id), [
    "upcoming-near-a",
    "upcoming-near-b",
    "upcoming-far",
  ]);
});

test("hides AI scores until professor publication and then returns only the official result", () => {
  const pending = buildStudentHistoryItem({ submission: submission(), exam: exam(), className: "CS", professorName: "Professor One" });
  assert.equal(pending.resultStatus, "pending_review");
  assert.equal(pending.officialScore, null);
  assert.equal(pending.officialScoreLabel, null);

  const unfinished = buildStudentHistoryItem({
    submission: submission({ status: "in_progress", professorDecision: "accepted" }),
    exam: exam(),
    className: "CS",
    professorName: "Professor One",
  });
  assert.equal(unfinished.resultStatus, "pending_review");
  assert.equal(unfinished.officialScore, null);

  const published = buildStudentHistoryItem({
    submission: submission({ professorDecision: "accepted" }),
    exam: exam(),
    className: "CS",
    professorName: "Professor One",
  });
  assert.equal(published.resultStatus, "published");
  assert.equal(published.officialScore, 82);
  assert.equal(published.officialScoreLabel, "82%");
});

test("returns a whitelisted immediate diagnostic report only when the professor enables it", () => {
  const visible = buildImmediateAdaptiveDiagnosticReport({
    exam: exam({ showFinalScoreImmediately: true }),
    attempt: submission({
      finalScore: 82.4,
      strengths: ["  Clear explanation  ", 42] as unknown as string[],
      weaknesses: ["Needs a more precise example"],
      recommendations: ["Review transport protocols"],
    }),
  });

  assert.deepEqual(visible, {
    finalScore: 82,
    strengths: ["Clear explanation"],
    weaknesses: ["Needs a more precise example"],
    recommendations: ["Review transport protocols"],
  });
  assert.deepEqual(Object.keys(visible || {}).sort(), [
    "finalScore",
    "recommendations",
    "strengths",
    "weaknesses",
  ]);

  const hidden = buildImmediateAdaptiveDiagnosticReport({
    exam: exam({ showFinalScoreImmediately: false }),
    attempt: submission({ finalScore: 82 }),
  });
  assert.equal(hidden, null);
});

test("does not expose an immediate diagnostic report for unfinished attempts or invalid scores", () => {
  assert.equal(buildImmediateAdaptiveDiagnosticReport({
    exam: exam({ showFinalScoreImmediately: true }),
    attempt: submission({ status: "in_progress", finalScore: 82 }),
  }), null);
  assert.equal(buildImmediateAdaptiveDiagnosticReport({
    exam: exam({ showFinalScoreImmediately: true }),
    attempt: submission({ finalScore: Number.NaN }),
  }), null);
});

test("persistent classes and attempts remain associated through the stable account ID", () => {
  const stableStudentId = "student-account-1";
  const membershipsByStudent = new Map([[stableStudentId, [{ classId: "class-1", status: "active" }]]]);
  const attemptsByStudent = new Map([[stableStudentId, [submission({ studentId: stableStudentId })]]]);
  assert.equal(hasStudentMembership(membershipsByStudent.get(stableStudentId) || [], "class-1"), true);
  assert.equal(studentOwnsAttempt(stableStudentId, attemptsByStudent.get(stableStudentId)![0]), true);
});

test("leaving a class revokes membership access without removing owned attempt history", () => {
  const ownedAttempt = submission({ studentId: "student-1" });
  const classExam = exam({ classId: "class-1" });
  assert.equal(canStudentAccessExam({
    exam: classExam,
    examId: classExam.id,
    studentId: "student-1",
    enrolledClassIds: new Set(["class-1"]),
  }), true);
  assert.equal(canStudentAccessExam({
    exam: classExam,
    examId: classExam.id,
    studentId: "student-1",
    enrolledClassIds: new Set(),
  }), false);
  assert.equal(studentOwnsAttempt("student-1", ownedAttempt), true);
  const history = buildStudentHistoryItem({
    submission: ownedAttempt,
    exam: classExam,
    className: "Original Class",
    professorName: "Original Professor",
  });
  assert.equal(history.className, "Original Class");
  assert.equal(history.professorName, "Original Professor");
});

test("leave removes only the authenticated student's membership and preserves academic records", async () => {
  const memberships = [
    { studentId: "student-1", classId: "class-1" },
    { studentId: "student-2", classId: "class-1" },
    { studentId: "student-1", classId: "class-2" },
  ];
  const classRecords = [{ id: "class-1" }, { id: "class-2" }];
  const examRecords = [{ id: "exam-1", classId: "class-1" }];
  const attemptRecords = [{ id: "attempt-1", studentId: "student-1", examId: "exam-1" }];
  const publishedResults = [{ attemptId: "attempt-1", officialScore: 82 }];
  const preservedRecords = JSON.stringify({ classRecords, examRecords, attemptRecords, publishedResults });
  const deletedPairs: string[] = [];

  const deleteEnrollment = async (studentId: string, classId: string) => {
    deletedPairs.push(`${studentId}:${classId}`);
    const index = memberships.findIndex((membership) => (
      membership.studentId === studentId && membership.classId === classId
    ));
    if (index < 0) return false;
    memberships.splice(index, 1);
    return true;
  };

  const deleted = await leaveStudentClassMembership({
    authenticatedStudentId: "student-1",
    classId: "class-1",
    deleteEnrollment,
  });

  assert.equal(deleted, true);
  assert.deepEqual(deletedPairs, ["student-1:class-1"]);
  assert.deepEqual(memberships, [
    { studentId: "student-2", classId: "class-1" },
    { studentId: "student-1", classId: "class-2" },
  ]);
  assert.equal(JSON.stringify({ classRecords, examRecords, attemptRecords, publishedResults }), preservedRecords);
  assert.equal(await leaveStudentClassMembership({
    authenticatedStudentId: "student-1",
    classId: "class-1",
    deleteEnrollment,
  }), false);
  assert.deepEqual(memberships, [
    { studentId: "student-2", classId: "class-1" },
    { studentId: "student-1", classId: "class-2" },
  ]);
});
