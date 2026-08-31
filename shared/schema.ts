import { z } from "zod";
import { pgTable, varchar, timestamp, jsonb, real, text, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

import { users } from "./models/auth";
export * from "./models/auth";

export const questionTypes = ["mcq", "short", "audio"] as const;
export type QuestionType = (typeof questionTypes)[number];

export const userRoles = ["professor", "student", "admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const questionSchema = z.object({
  id: z.string(),
  text: z.string().min(1, "Question text is required"),
  type: z.enum(questionTypes),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().optional(),
});

export type Question = z.infer<typeof questionSchema>;

export const insertQuestionSchema = questionSchema.omit({ id: true });
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export const examResponseSchema = z.object({
  questionId: z.string(),
  response: z.string(),
  audioData: z.string().optional(),
  transcript: z.string().optional(),
});

export type ExamResponse = z.infer<typeof examResponseSchema>;

export const gradingMethods = ["ai", "fallback", "exact", "manual"] as const;
export type GradingMethod = (typeof gradingMethods)[number];

// Universities table
export const universities = pgTable("universities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  domain: varchar("domain"),
  openaiApiKey: varchar("openai_api_key"),
  geminiApiKey: varchar("gemini_api_key"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type University = typeof universities.$inferSelect;
export type InsertUniversity = typeof universities.$inferInsert;

// Classes table
export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectName: varchar("subject_name").notNull(),
  courseNumber: varchar("course_number"),
  sectionNumber: varchar("section_number"),
  universityId: varchar("university_id"),
  professorId: varchar("professor_id"), // Optional now
  createdByAdminId: varchar("created_by_admin_id"),
  roster: jsonb("roster").$type<string[]>().default([]),
  classCode: varchar("class_code").unique(),
  status: varchar("status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Class = typeof classes.$inferSelect;
export type InsertClass = typeof classes.$inferInsert;

// Class materials table (uploaded by professors for AI context)
export const classMaterials = pgTable("class_materials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  classId: varchar("class_id").notNull(),
  professorId: varchar("professor_id").notNull(),
  fileName: varchar("file_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ClassMaterial = typeof classMaterials.$inferSelect;
export type InsertClassMaterial = typeof classMaterials.$inferInsert;

// Enrollments table (students enrolled in classes)
export const enrollments = pgTable("enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id"), // Nullable for guest enrollments
  guestStudentId: varchar("guest_student_id"),
  displayName: varchar("display_name"),
  classId: varchar("class_id").notNull(),
  status: varchar("status").default("active"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
  lastAccessedAt: timestamp("last_accessed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("enrollments_student_class_unique")
    .on(table.studentId, table.classId)
    .where(sql`${table.studentId} is not null`),
  index("enrollments_class_id_idx").on(table.classId),
],
);

export type Enrollment = typeof enrollments.$inferSelect;
export type InsertEnrollment = typeof enrollments.$inferInsert;

// Exams table
export const exams = pgTable("exams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  description: text("description"),
  subjectName: varchar("subject_name"),
  professorId: varchar("professor_id").notNull(),
  classId: varchar("class_id"),
  questions: jsonb("questions").notNull().$type<Question[]>().default([]),
  blueprint: jsonb("blueprint"),
  materialSummary: text("material_summary"),
  processingMethod: varchar("processing_method"), // local-text | gemini-pdf
  pageCount: integer("page_count"),
  processingStatus: varchar("processing_status"), // active | error
  processingError: text("processing_error"),
  maxQuestions: integer("max_questions").default(10),
  maxAttempts: integer("max_attempts").notNull().default(1),
  maxFollowUpsPerConcept: integer("max_follow_ups_per_concept").default(2),
  durationMinutes: integer("duration_minutes").default(30),
  passingScore: real("passing_score").default(60),
  showFinalScoreImmediately: boolean("show_final_score_immediately").default(true),
  status: varchar("status").default("active"),
  startTime: varchar("start_time"),
  endTime: varchar("end_time"),
  assignedStudentIds: jsonb("assigned_student_ids").notNull().$type<string[]>().default([]),
  assignedStudentNames: jsonb("assigned_student_names").notNull().$type<string[]>().default([]),
  accessCode: varchar("access_code").unique(), // Deprecated, use publicExamCode
  publicExamCode: varchar("public_exam_code").unique(),
  accessCodeExpiresAt: timestamp("access_code_expires_at"),
  mode: varchar("mode").notNull().default("exam"),
  currentVersionId: varchar("current_version_id"),
  createdAt: timestamp("created_at").defaultNow(),
  publishedAt: timestamp("published_at"),
  archivedAt: timestamp("archived_at"),
});

export type Exam = typeof exams.$inferSelect;

export const insertExamSchema = z.object({
  title: z.string().min(1, "Exam title is required"),
  description: z.string().optional(),
  subjectName: z.string().optional(),
  questions: z.array(insertQuestionSchema).optional().default([]),
  blueprint: z.any().optional(),
  maxQuestions: z.number().optional().default(10),
  maxAttempts: z.number().int().min(1).max(10).optional().default(1),
  maxFollowUpsPerConcept: z.number().optional().default(2),
  durationMinutes: z.number().optional().default(30),
  passingScore: z.number().optional().default(60),
  showFinalScoreImmediately: z.boolean().optional().default(true),
  classId: z.string().optional().nullable(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  assignedStudentIds: z.array(z.string()).optional(),
  assignedStudentNames: z.array(z.string()).optional(),
  professorId: z.string().optional(),
  customAccessCode: z.string().max(10).optional(),
  autoGenerateCode: z.boolean().optional(),
  mode: z.enum(["exam", "quickvox", "adaptive"]).optional().default("exam"),
  status: z.enum(["active", "draft", "inactive"]).optional(),
});

export type InsertExam = z.infer<typeof insertExamSchema>;

// Dual score structure per question
export interface DualScore {
  correctness: number;
  understanding: number;
}

// Proctoring flag for tab switch detection
export interface ProctoringFlag {
  type: "tab_switch";
  timestamp: string;
  durationAway?: number;
  screenshotBefore?: string;
  screenshotDuring?: string;
  screenshotAfter?: string;
  aiVerdict?: string;
}

// Suspicious threshold for tab switches
export const TAB_SWITCH_SUSPICIOUS_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// VoxScore seven-dimension framework
// ---------------------------------------------------------------------------

// The seven VoxScore dimensions (D1–D7)
export const voxDimensions = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const;
export type VoxDimension = (typeof voxDimensions)[number];

// Canonical dimension weights (sum to 1.0)
export const VOX_DIMENSION_WEIGHTS: Record<VoxDimension, number> = {
  D1: 0.25,
  D2: 0.2,
  D3: 0.15,
  D4: 0.15,
  D5: 0.1,
  D6: 0.1,
  D7: 0.05,
};

// VoxScore pass threshold (out of 100)
export const VOX_PASS_THRESHOLD = 60;

// Five bands per dimension: Inadequate (1) … Exemplary (5)
export const voxBands = [1, 2, 3, 4, 5] as const;
export type VoxBand = (typeof voxBands)[number];

// Per-dimension scoring result
export interface VoxDimensionScore {
  dimension: VoxDimension;
  band: VoxBand;
  weightedScore: number; // contribution to the 0–100 total for this dimension
  evidence: string;
  conceptsPresent: string[];
  conceptsMissing: string[];
  conceptsIncorrect: string[];
}

// Confidence in the AI evaluation
export type VoxConfidenceLevel = "high" | "medium" | "low";

// ASR quality flag for the underlying transcript
export type VoxAsrQualityFlag = "ok" | "low_confidence" | "needs_human_review";

// Full seven-dimension VoxScore profile (0–100 scale)
export interface VoxScoreProfile {
  dimensions: VoxDimensionScore[];
  totalScore: number; // 0–100
  passFail: "pass" | "fail";
  confidenceLevel: VoxConfidenceLevel;
  asrQualityFlag: VoxAsrQualityFlag;
  languageDetected: string;
}

// ---------------------------------------------------------------------------
// VoxPractice — private, student-led oral self-training (separate from QuickVox
// Phases 1-3 and from the professor-facing exam grading pipeline)
// ---------------------------------------------------------------------------

// Where the practice material came from
export const practiceSourceTypes = ["upload", "subject", "topic"] as const;
export type PracticeSourceType = (typeof practiceSourceTypes)[number];

// Practice session intent / shape
export const practiceSessionModes = ["warmup", "readiness_sprint", "weak_spot", "mock_oral"] as const;
export type PracticeSessionMode = (typeof practiceSessionModes)[number];

// How encouraging vs demanding the AI coach is
export const practiceCoachStyles = ["gentle", "normal", "strict"] as const;
export type PracticeCoachStyle = (typeof practiceCoachStyles)[number];

// Cognitive level a practice question targets
export const practiceCognitiveLevels = [
  "recall",
  "understanding",
  "application",
  "comparison",
  "reasoning",
  "defense",
] as const;
export type PracticeCognitiveLevel = (typeof practiceCognitiveLevels)[number];

// Coverage status for a single concept/topic in a session
export const practiceCoverageStatuses = ["strong", "developing", "weak", "not_covered"] as const;
export type PracticeCoverageStatus = (typeof practiceCoverageStatuses)[number];

// A single practice question plus everything captured while answering it
export interface PracticeQuestion {
  id: string;
  text: string;
  cognitiveLevel: PracticeCognitiveLevel;
  concept?: string; // the material concept this question targets
  transcript?: string; // the student's transcribed answer
  followUpProbe?: string; // single AI probe drawn from the approved list
  followUpTranscript?: string; // student's answer to the probe (optional)
  microFeedback?: string; // short per-answer coaching note
  voxScoreProfile?: VoxScoreProfile; // 7-dimension practice score for this answer
}

// Coverage map: concept/topic -> status
export type PracticeConceptCoverageMap = Record<string, PracticeCoverageStatus>;

// Practice sessions table (private to the student — never visible to professors)
export const practiceSessions = pgTable("practice_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  sourceType: text("source_type").notNull(),
  sourceSummary: text("source_summary"),
  sessionMode: text("session_mode").notNull(),
  coachStyle: text("coach_style").notNull().default("normal"),
  questions: jsonb("questions").$type<PracticeQuestion[]>().default([]),
  overallReadinessScore: real("overall_readiness_score"),
  overallVoxScoreProfile: jsonb("overall_vox_score_profile").$type<VoxScoreProfile>(),
  conceptCoverageMap: jsonb("concept_coverage_map").$type<PracticeConceptCoverageMap>(),
  languageUsed: text("language_used"),
  completedQuestionCount: integer("completed_question_count").default(0),
  consentGiven: boolean("consent_given").default(false),
  consentTimestamp: timestamp("consent_timestamp"),
});

export type PracticeSession = typeof practiceSessions.$inferSelect;

export const insertPracticeSessionSchema = createInsertSchema(practiceSessions, {
  sourceType: z.enum(practiceSourceTypes),
  sessionMode: z.enum(practiceSessionModes),
  coachStyle: z.enum(practiceCoachStyles).optional(),
}).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  studentId: true,
  questions: true,
  overallReadinessScore: true,
  overallVoxScoreProfile: true,
  conceptCoverageMap: true,
  completedQuestionCount: true,
  consentGiven: true,
  consentTimestamp: true,
});

export type InsertPracticeSession = z.infer<typeof insertPracticeSessionSchema>;

// Professor decision on an AI-suggested VoxScore
export const professorDecisions = ["accepted", "adjusted", "overridden"] as const;
export type ProfessorDecision = (typeof professorDecisions)[number];

// Submissions table (Oral Exam Attempts)
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: varchar("exam_id").notNull(),
  examVersionId: varchar("exam_version_id"),
  studentId: varchar("student_id").notNull(),
  studentSnapshot: jsonb("student_snapshot"),
  examSnapshot: jsonb("exam_snapshot"),
  startedAt: timestamp("started_at"),
  responses: jsonb("responses").notNull().$type<ExamResponse[]>().default([]),
  scores: jsonb("scores").notNull().$type<Record<string, number>>().default({}),
  understandingScores: jsonb("understanding_scores").$type<Record<string, number>>(),
  gradingMethods: jsonb("grading_methods").$type<Record<string, GradingMethod>>(),
  totalScore: real("total_score").notNull().default(0),
  percentageScore: real("percentage_score"),
  manualScore: real("manual_score"),
  reviewStatus: varchar("review_status").default("not_reviewed"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  totalUnderstandingScore: real("total_understanding_score"),
  feedback: jsonb("feedback").$type<{ strengths: string; weakPoints: string; recommendations: string } | null>(),
  status: varchar("status").default("completed"), // in_progress | completed
  currentConceptIndex: integer("current_concept_index").default(0),
  adaptiveState: jsonb("adaptive_state"),
  questionLogs: jsonb("question_logs").default([]),
  finalScore: real("final_score"),
  topicScores: jsonb("topic_scores"),
  strengths: jsonb("strengths").default([]),
  weaknesses: jsonb("weaknesses").default([]),
  missingConcepts: jsonb("missing_concepts").default([]),
  misconceptions: jsonb("misconceptions").default([]),
  recommendations: jsonb("recommendations").default([]),
  futureSuggestions: jsonb("future_suggestions").default([]),
  doctorFinalScore: real("doctor_final_score"),
  doctorTopicScores: jsonb("doctor_topic_scores"),
  doctorScoreOverrides: jsonb("doctor_score_overrides").default([]),
  isPreview: varchar("is_preview").default("false"),
  screenRecordingUrl: varchar("screen_recording_url"),
  webcamRecordingUrl: varchar("webcam_recording_url"),
  proctoringUploadStatus: text("proctoring_upload_status"),
  proctoringUploadError: text("proctoring_upload_error"),
  proctoringFlags: jsonb("proctoring_flags").$type<ProctoringFlag[]>(),
  tabSwitchCount: real("tab_switch_count").default(0),
  isSuspicious: varchar("is_suspicious").default("false"),
  quickvoxInsight: text("quickvox_insight"),
  quickvoxFollowUp: text("quickvox_follow_up"),
  voxScoreProfile: jsonb("vox_score_profile").$type<VoxScoreProfile>(),
  professorVoxScoreProfile: jsonb("professor_vox_score_profile").$type<VoxScoreProfile>(),
  professorDecision: text("professor_decision"),
  professorOverrideReason: text("professor_override_reason"),
  professorHolisticScore: real("professor_holistic_score"),
  professorReviewTimestamp: timestamp("professor_review_timestamp"),
  professorReviewDurationMinutes: real("professor_review_duration_minutes"),
  gradingGap: real("grading_gap"),
  arabicFlag: boolean("arabic_flag"),
  consentGiven: boolean("consent_given").default(false),
  consentTimestamp: timestamp("consent_timestamp"),
  asrConfidenceLevel: text("asr_confidence_level"),
  asrEstimatedWer: text("asr_estimated_wer"),
  criticalConceptErrorFlag: boolean("critical_concept_error_flag"),
  languageUsed: text("language_used"),
  answerDurationSeconds: real("answer_duration_seconds"),
  estimatedWordCount: integer("estimated_word_count"),
  submittedAt: varchar("submitted_at").notNull(),
}, (table) => [
  index("submissions_student_exam_idx").on(table.studentId, table.examId),
],
);

export type ExamSubmission = typeof submissions.$inferSelect;

export const insertExamSubmissionSchema = z.object({
  examId: z.string(),
  responses: z.array(examResponseSchema),
  studentId: z.string().optional(),
  isPreview: z.boolean().optional(),
  consentGiven: z.boolean().optional(),
  consentTimestamp: z.string().optional(),
});

export type InsertExamSubmission = z.infer<typeof insertExamSubmissionSchema>;

// Relations
export const universitiesRelations = relations(universities, ({ many }) => ({
  classes: many(classes),
}));

export const classesRelations = relations(classes, ({ many }) => ({
  enrollments: many(enrollments),
  exams: many(exams),
  materials: many(classMaterials),
}));

export const classMaterialsRelations = relations(classMaterials, ({ one }) => ({
  class: one(classes, { fields: [classMaterials.classId], references: [classes.id] }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  class: one(classes, { fields: [enrollments.classId], references: [classes.id] }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  class: one(classes, { fields: [exams.classId], references: [classes.id] }),
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  exam: one(exams, { fields: [submissions.examId], references: [exams.id] }),
  reviewRequests: many(reviewRequests),
}));

// User events table (audit logging)
export const userEvents = pgTable("user_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  eventType: varchar("event_type").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type UserEvent = typeof userEvents.$inferSelect;
export type InsertUserEvent = typeof userEvents.$inferInsert;

// Support requests table
export const supportRequests = pgTable("support_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  userName: varchar("user_name"),
  userRole: varchar("user_role"),
  status: varchar("status").notNull().default("pending"),
  message: varchar("message"),
  pageUrl: varchar("page_url"),
  createdAt: timestamp("created_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export type SupportRequest = typeof supportRequests.$inferSelect;
export type InsertSupportRequest = typeof supportRequests.$inferInsert;

// Chat messages table (for support chat)
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  supportRequestId: varchar("support_request_id").notNull(),
  senderId: varchar("sender_id").notNull(),
  senderRole: varchar("sender_role").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// Grade Review Requests table
export const reviewRequests = pgTable("review_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").notNull(),
  studentId: varchar("student_id").notNull(),
  examId: varchar("exam_id").notNull(),
  studentExplanation: text("student_explanation"),
  status: varchar("status").notNull().default("pending"), // pending, in_review, approved, partially_approved, rejected, resolved
  professorResponse: text("professor_response"),
  resolvedAt: timestamp("resolved_at"),
  resolvedByProfessorId: varchar("resolved_by_professor_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ReviewRequest = typeof reviewRequests.$inferSelect;
export type InsertReviewRequest = typeof reviewRequests.$inferInsert;

export const reviewRequestsRelations = relations(reviewRequests, ({ one }) => ({
  attempt: one(submissions, { fields: [reviewRequests.attemptId], references: [submissions.id] }),
  exam: one(exams, { fields: [reviewRequests.examId], references: [exams.id] }),
}));

export interface QuestionTypeBreakdown {
  type: QuestionType;
  avgCorrectness: number;
  avgUnderstanding: number;
  count: number;
}

export interface SubmissionTimelineEntry {
  submissionId: string;
  examId: string;
  examTitle: string;
  correctnessScore: number;
  understandingScore: number;
  submittedAt: string;
}

export interface PerformanceTrend {
  firstThreeAvgCorrectness: number;
  firstThreeAvgUnderstanding: number;
  lastThreeAvgCorrectness: number;
  lastThreeAvgUnderstanding: number;
  correctnessChange: number;
  understandingChange: number;
  direction: "improving" | "declining" | "stable";
}

export interface GradingMethodDistribution {
  ai: number;
  exact: number;
  fallback: number;
  manual: number;
  total: number;
  fallbackRatio: number;
}

export interface StudentPerformanceRadar {
  studentId: string;
  totalSubmissions: number;
  avgCorrectness: number;
  avgUnderstanding: number;
  questionTypeBreakdown: QuestionTypeBreakdown[];
  strongestArea: QuestionTypeBreakdown | null;
  weakestArea: QuestionTypeBreakdown | null;
  trend: PerformanceTrend | null;
  gradingMethodDistribution: GradingMethodDistribution;
  integrityRiskLevel: "low" | "moderate" | "high";
  suspiciousSubmissionCount: number;
  avgTabSwitchCount: number;
  submissionTimeline: SubmissionTimelineEntry[];
}
// ... to add to schema.ts

// Exam Versions table
export const examVersions = pgTable("exam_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: varchar("exam_id").notNull(),
  versionNumber: integer("version_number").notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  subjectName: varchar("subject_name"),
  instructions: text("instructions"),
  durationMinutes: integer("duration_minutes").default(30),
  maxQuestions: integer("max_questions").default(10),
  passingScore: real("passing_score").default(60),
  totalPoints: real("total_points").default(0),
  adaptiveSettings: jsonb("adaptive_settings"), // Maps to blueprint
  gradingSettings: jsonb("grading_settings"),
  availabilityStart: timestamp("availability_start"),
  availabilityEnd: timestamp("availability_end"),
  createdBy: varchar("created_by").notNull(), // professorId
  createdAt: timestamp("created_at").defaultNow(),
  publishedAt: timestamp("published_at"),
});

export type ExamVersion = typeof examVersions.$inferSelect;
export type InsertExamVersion = typeof examVersions.$inferInsert;

// Exam Questions table
export const examQuestions = pgTable("exam_questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  examVersionId: varchar("exam_version_id").notNull(),
  questionOrder: integer("question_order").notNull(),
  questionText: text("question_text").notNull(),
  questionType: varchar("question_type").notNull(), // e.g. "oral", "mcq"
  expectedAnswer: text("expected_answer"),
  gradingRubric: text("grading_rubric"),
  maximumPoints: real("maximum_points").default(100),
  difficulty: varchar("difficulty").default("intermediate"),
  topic: varchar("topic"),
  followUpRules: jsonb("follow_up_rules"),
  adaptiveMetadata: jsonb("adaptive_metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ExamQuestion = typeof examQuestions.$inferSelect;
export type InsertExamQuestion = typeof examQuestions.$inferInsert;

// Attempt Answers table
export const attemptAnswers = pgTable("attempt_answers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").notNull(),
  questionId: varchar("question_id").notNull(),
  questionSnapshot: jsonb("question_snapshot"),
  answerText: text("answer_text"),
  transcript: text("transcript"),
  audioStoragePath: varchar("audio_storage_path"),
  answerStartedAt: timestamp("answer_started_at"),
  answeredAt: timestamp("answered_at"),
  responseDurationSeconds: real("response_duration_seconds"),
  automaticScore: real("automatic_score"),
  automaticFeedback: text("automatic_feedback"),
  automaticGradingExplanation: text("automatic_grading_explanation"),
  automaticConfidence: varchar("automatic_confidence"),
  manualScore: real("manual_score"),
  manualFeedback: text("manual_feedback"),
  finalScore: real("final_score"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AttemptAnswer = typeof attemptAnswers.$inferSelect;
export type InsertAttemptAnswer = typeof attemptAnswers.$inferInsert;

// Grading Audit Logs table
export const gradingAuditLogs = pgTable("grading_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").notNull(),
  answerId: varchar("answer_id"), // Nullable if it's an attempt-wide score change
  professorId: varchar("professor_id").notNull(),
  previousScore: real("previous_score"),
  newScore: real("new_score"),
  previousFeedback: text("previous_feedback"),
  newFeedback: text("new_feedback"),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type GradingAuditLog = typeof gradingAuditLogs.$inferSelect;
export type InsertGradingAuditLog = typeof gradingAuditLogs.$inferInsert;

// Updates to `exams`:
/*
  currentVersionId: varchar("current_version_id"),
  publishedAt: timestamp("published_at"),
  archivedAt: timestamp("archived_at"),
  publicExamCode: varchar("public_exam_code").unique(), // rename from accessCode
*/

// Updates to `submissions`:
/*
  examVersionId: varchar("exam_version_id"),
  studentSnapshot: jsonb("student_snapshot"),
  examSnapshot: jsonb("exam_snapshot"),
  startedAt: timestamp("started_at"),
  percentageScore: real("percentage_score"),
  reviewStatus: varchar("review_status").default("not_reviewed"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  manualScore: real("manual_score"),
*/

export const examVersionsRelations = relations(examVersions, ({ one, many }) => ({
  exam: one(exams, { fields: [examVersions.examId], references: [exams.id] }),
  questions: many(examQuestions),
  attempts: many(submissions),
}));

export const examQuestionsRelations = relations(examQuestions, ({ one }) => ({
  examVersion: one(examVersions, { fields: [examQuestions.examVersionId], references: [examVersions.id] }),
}));

export const attemptAnswersRelations = relations(attemptAnswers, ({ one }) => ({
  attempt: one(submissions, { fields: [attemptAnswers.attemptId], references: [submissions.id] }),
  question: one(examQuestions, { fields: [attemptAnswers.questionId], references: [examQuestions.id] }),
}));

export const gradingAuditLogsRelations = relations(gradingAuditLogs, ({ one }) => ({
  attempt: one(submissions, { fields: [gradingAuditLogs.attemptId], references: [submissions.id] }),
  answer: one(attemptAnswers, { fields: [gradingAuditLogs.answerId], references: [attemptAnswers.id] }),
  professor: one(users, { fields: [gradingAuditLogs.professorId], references: [users.id] }),
}));
