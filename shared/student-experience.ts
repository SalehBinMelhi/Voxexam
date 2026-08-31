import type { Question } from "./schema";

export type StudentExamStatus = "upcoming" | "available" | "completed" | "closed";

export type StudentAttemptStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "published";

export type StudentExamAction =
  | "start"
  | "continue"
  | "opens_at"
  | "view_result"
  | "pending_review"
  | "closed";

export interface StudentSelfSummary {
  id: string;
  email: string;
  displayName: string;
}

export interface StudentClassSummary {
  id: string;
  name: string;
  courseNumber: string | null;
  sectionNumber: string | null;
  professorName: string | null;
}

export interface StudentExamSummary {
  id: string;
  classId: string | null;
  title: string;
  description: string | null;
  className: string | null;
  professorName: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  mode: string;
  status: StudentExamStatus;
  attemptStatus: StudentAttemptStatus;
  action: StudentExamAction;
  actionLabel: string;
  disabledReason: string | null;
  attemptId: string | null;
  maxAttempts: number;
  attemptsUsed: number;
  canStartAnotherAttempt: boolean;
}

export interface StudentClassExamsData {
  classId: string;
  exams: StudentExamSummary[];
}

export interface StudentExamHistoryItem {
  attemptId: string;
  examId: string;
  examTitle: string;
  className: string | null;
  professorName: string | null;
  completedAt: string;
  resultStatus: "pending_review" | "published";
  officialScore: number | null;
  officialScoreLabel: string | null;
}

export interface StudentDashboardData {
  student: StudentSelfSummary;
  classes: StudentClassSummary[];
  exams: StudentExamSummary[];
  history: StudentExamHistoryItem[];
}

export type StudentExamQuestion = Omit<Question, "correctAnswer">;

export interface StudentTakeExam {
  id: string;
  title: string;
  description: string | null;
  subjectName: string | null;
  questions: StudentExamQuestion[];
  durationMinutes: number | null;
  maxQuestions: number | null;
  startTime: string | null;
  endTime: string | null;
  mode: string;
}

export interface StudentExamAccessData {
  exam: StudentTakeExam;
  attemptId: string | null;
}
