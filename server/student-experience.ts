import type { Exam, ExamSubmission, Question } from "@shared/schema";
import type {
  StudentExamAction,
  StudentExamHistoryItem,
  StudentExamStatus,
  StudentExamSummary,
  StudentTakeExam,
} from "@shared/student-experience";

export interface StudentAccessDecision {
  allowed: boolean;
  status: number;
  error: string | null;
}

export interface ImmediateAdaptiveDiagnosticReport {
  finalScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

function sanitizeDiagnosticItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 1_000))
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Builds the optional, non-official report shown immediately after an
 * adaptive exam. The professor's exam-level setting is the sole visibility
 * switch, and the whitelist prevents attempt internals from reaching the
 * student response.
 */
export function buildImmediateAdaptiveDiagnosticReport(input: {
  exam: Pick<Exam, "showFinalScoreImmediately">;
  attempt: Pick<
    ExamSubmission,
    "status" | "finalScore" | "strengths" | "weaknesses" | "recommendations"
  >;
}): ImmediateAdaptiveDiagnosticReport | null {
  if (input.exam.showFinalScoreImmediately !== true || input.attempt.status !== "completed") {
    return null;
  }

  const score = input.attempt.finalScore;
  if (typeof score !== "number" || !Number.isFinite(score)) return null;

  return {
    finalScore: Math.round(Math.max(0, Math.min(100, score))),
    strengths: sanitizeDiagnosticItems(input.attempt.strengths),
    weaknesses: sanitizeDiagnosticItems(input.attempt.weaknesses),
    recommendations: sanitizeDiagnosticItems(input.attempt.recommendations),
  };
}

export function normalizeAccessCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function dateValue(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function validateExamWindow(exam: Pick<Exam, "status" | "startTime" | "endTime">, now = new Date()): StudentAccessDecision {
  if (exam.status !== "active") {
    return { allowed: false, status: 403, error: "This exam is closed." };
  }

  const start = dateValue(exam.startTime);
  const end = dateValue(exam.endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { allowed: false, status: 403, error: "This exam has an invalid availability period." };
  }

  if (start !== null && now.getTime() < start) {
    return { allowed: false, status: 403, error: "This exam has not started yet." };
  }
  if (end !== null && now.getTime() > end) {
    return { allowed: false, status: 410, error: "This exam is closed." };
  }
  return { allowed: true, status: 200, error: null };
}

export function validateExamCodeExpiry(
  exam: Pick<Exam, "accessCodeExpiresAt">,
  now = new Date(),
): StudentAccessDecision {
  if (exam.accessCodeExpiresAt && exam.accessCodeExpiresAt.getTime() < now.getTime()) {
    return { allowed: false, status: 410, error: "This exam code has expired." };
  }
  return { allowed: true, status: 200, error: null };
}

export function validateAttemptLimit(
  exam: Pick<Exam, "maxAttempts">,
  attempts: Pick<ExamSubmission, "status" | "isPreview">[],
): StudentAccessDecision {
  const realAttempts = attempts.filter((attempt) => attempt.isPreview !== "true");
  if (realAttempts.some((attempt) => attempt.status === "in_progress")) {
    return { allowed: true, status: 200, error: null };
  }
  const completedCount = realAttempts.filter((attempt) => attempt.status !== "in_progress").length;
  if (completedCount >= Math.max(1, exam.maxAttempts ?? 1)) {
    return { allowed: false, status: 409, error: "You have used all allowed attempts." };
  }
  return { allowed: true, status: 200, error: null };
}

/**
 * Validate creation of a new attempt. Unlike validateAttemptLimit, an existing
 * in-progress attempt consumes a slot here; callers must resume that attempt
 * through its dedicated endpoint instead of creating a parallel submission.
 */
export function validateNewAttemptCreation(
  exam: Pick<Exam, "maxAttempts">,
  attempts: Pick<ExamSubmission, "status" | "isPreview">[],
): StudentAccessDecision {
  const realAttempts = attempts.filter((attempt) => attempt.isPreview !== "true");
  if (realAttempts.some((attempt) => attempt.status === "in_progress")) {
    return { allowed: false, status: 409, error: "An exam attempt is already in progress." };
  }
  if (realAttempts.filter((attempt) => attempt.status !== "in_progress").length >= Math.max(1, exam.maxAttempts ?? 1)) {
    return { allowed: false, status: 409, error: "You have used all allowed attempts." };
  }
  return { allowed: true, status: 200, error: null };
}

export function canStudentAccessExam(input: {
  exam: Pick<Exam, "classId" | "assignedStudentIds">;
  studentId: string;
  enrolledClassIds: ReadonlySet<string>;
  directGrantExamIds?: ReadonlySet<string>;
  examId: string;
}): boolean {
  return Boolean(
    (input.exam.classId && input.enrolledClassIds.has(input.exam.classId)) ||
      input.exam.assignedStudentIds.includes(input.studentId) ||
      input.directGrantExamIds?.has(input.examId),
  );
}

export function hasStudentMembership(
  memberships: ReadonlyArray<{ classId: string; status?: string | null }>,
  classId: string,
): boolean {
  return memberships.some(
    (membership) => membership.classId === classId && membership.status !== "inactive",
  );
}

export async function leaveStudentClassMembership(input: {
  authenticatedStudentId: string;
  classId: string;
  deleteEnrollment: (studentId: string, classId: string) => Promise<boolean>;
}): Promise<boolean> {
  return input.deleteEnrollment(input.authenticatedStudentId, input.classId);
}

export function studentOwnsAttempt(
  studentId: string,
  attempt: Pick<ExamSubmission, "studentId" | "isPreview">,
): boolean {
  return attempt.studentId === studentId && attempt.isPreview !== "true";
}

export function sanitizeExamForStudent(exam: Exam): StudentTakeExam {
  const questions = (exam.questions || []).map((question: Question) => {
    const { correctAnswer: _correctAnswer, ...safeQuestion } = question;
    return safeQuestion;
  });

  return {
    id: exam.id,
    title: exam.title,
    description: exam.description ?? null,
    subjectName: exam.subjectName ?? null,
    questions,
    durationMinutes: exam.durationMinutes ?? null,
    maxQuestions: exam.maxQuestions ?? null,
    startTime: exam.startTime ?? null,
    endTime: exam.endTime ?? null,
    mode: exam.mode,
  };
}

function studentExamPriority(exam: StudentExamSummary): number {
  if (exam.attemptStatus === "submitted") return 2;
  if (exam.attemptStatus === "published") return 3;
  if (exam.status === "available") return 0;
  if (exam.status === "upcoming") return 1;
  return 4;
}

function relevantStartDistance(exam: StudentExamSummary, now: Date): number {
  if (!exam.startTime) return Number.POSITIVE_INFINITY;
  const start = new Date(exam.startTime).getTime();
  return Number.isFinite(start)
    ? Math.abs(start - now.getTime())
    : Number.POSITIVE_INFINITY;
}

/**
 * Produces a stable, non-mutating student exam list. Duplicate IDs are
 * collapsed before sorting because class, direct-code, and assignment access
 * may legitimately point to the same exam.
 */
export function dedupeAndSortStudentExams(
  exams: ReadonlyArray<StudentExamSummary>,
  now = new Date(),
): StudentExamSummary[] {
  const uniqueById = new Map<string, StudentExamSummary>();
  for (const exam of exams) {
    if (!uniqueById.has(exam.id)) uniqueById.set(exam.id, exam);
  }

  return Array.from(uniqueById.values()).sort((left, right) => {
    const priority = studentExamPriority(left) - studentExamPriority(right);
    if (priority !== 0) return priority;

    const leftDistance = relevantStartDistance(left, now);
    const rightDistance = relevantStartDistance(right, now);
    if (leftDistance !== rightDistance) return leftDistance < rightDistance ? -1 : 1;
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });
}

function officialResult(submission: ExamSubmission, examMode: string): { score: number; label: string } | null {
  if (submission.status !== "completed" || !submission.professorDecision) return null;

  if (submission.professorHolisticScore != null) {
    const value = Math.max(0, Math.min(10, submission.professorHolisticScore));
    return { score: value * 10, label: `${Number(value.toFixed(1))}/10` };
  }

  let value = submission.doctorFinalScore;
  if (value == null && examMode === "adaptive") value = submission.finalScore;
  if (value == null) value = submission.totalScore;
  if (value == null) return null;

  const percent = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
  return { score: percent, label: `${Math.round(percent)}%` };
}

function availabilityStatus(exam: Exam, now: Date): StudentExamStatus {
  const result = validateExamWindow(exam, now);
  if (result.allowed) return "available";
  if (result.error === "This exam has not started yet.") return "upcoming";
  return "closed";
}

function actionFor(
  status: StudentExamStatus,
  latestAttempt: ExamSubmission | undefined,
): { action: StudentExamAction; label: string; reason: string | null } {
  if (latestAttempt && latestAttempt.status !== "in_progress") {
    if (latestAttempt.professorDecision) {
      return { action: "view_result", label: "View Result", reason: null };
    }
    return {
      action: "pending_review",
      label: "Pending Review",
      reason: "Your professor has not published this result yet.",
    };
  }
  if (status === "upcoming") {
    return { action: "opens_at", label: "Not Open Yet", reason: "This exam has not started yet." };
  }
  if (status === "closed") {
    return { action: "closed", label: "Closed", reason: "The permitted exam period has ended." };
  }
  if (latestAttempt?.status === "in_progress") {
    return { action: "continue", label: "Continue Exam", reason: null };
  }
  return { action: "start", label: "Start Exam", reason: null };
}

export function buildStudentExamSummary(input: {
  exam: Exam;
  attempts: ExamSubmission[];
  className: string | null;
  professorName: string | null;
  now?: Date;
}): StudentExamSummary {
  const realAttempts = input.attempts
    .filter((attempt) => attempt.isPreview !== "true")
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  const latestAttempt = realAttempts[0];
  let status = availabilityStatus(input.exam, input.now ?? new Date());
  const windowIsOpen = status === "available";
  const maxAttempts = Math.max(1, input.exam.maxAttempts ?? 1);
  const attemptsUsed = realAttempts.filter((attempt) => attempt.status !== "in_progress").length;
  const canStartAnotherAttempt = Boolean(
    windowIsOpen &&
    latestAttempt &&
    !realAttempts.some((attempt) => attempt.status === "in_progress") &&
    attemptsUsed < maxAttempts,
  );
  if (latestAttempt && latestAttempt.status !== "in_progress") status = "completed";
  const action = actionFor(status, latestAttempt);

  return {
    id: input.exam.id,
    classId: input.exam.classId ?? null,
    title: input.exam.title,
    description: input.exam.description ?? null,
    className: input.className,
    professorName: input.professorName,
    startTime: input.exam.startTime ?? null,
    endTime: input.exam.endTime ?? null,
    durationMinutes: input.exam.durationMinutes ?? null,
    mode: input.exam.mode,
    status,
    attemptStatus: !latestAttempt
      ? "not_started"
      : latestAttempt.status === "in_progress"
        ? "in_progress"
        : latestAttempt.professorDecision
          ? "published"
          : "submitted",
    action: action.action,
    actionLabel: action.label,
    disabledReason: action.reason,
    attemptId: latestAttempt?.id ?? null,
    maxAttempts,
    attemptsUsed,
    canStartAnotherAttempt,
  };
}

export function buildStudentHistoryItem(input: {
  submission: ExamSubmission;
  exam: Exam;
  className: string | null;
  professorName: string | null;
}): StudentExamHistoryItem {
  const official = officialResult(input.submission, input.exam.mode);
  return {
    attemptId: input.submission.id,
    examId: input.exam.id,
    examTitle: input.exam.title,
    className: input.className,
    professorName: input.professorName,
    completedAt: input.submission.submittedAt,
    resultStatus: official ? "published" : "pending_review",
    officialScore: official?.score ?? null,
    officialScoreLabel: official?.label ?? null,
  };
}
