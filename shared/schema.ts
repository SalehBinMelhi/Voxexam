import { z } from "zod";
import { pgTable, varchar, timestamp, jsonb, real, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";

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
  createdAt: timestamp("created_at").defaultNow(),
});

export type University = typeof universities.$inferSelect;
export type InsertUniversity = typeof universities.$inferInsert;

// Classes table
export const classes = pgTable("classes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  universityId: varchar("university_id"),
  professorId: varchar("professor_id").notNull(),
  roster: jsonb("roster").$type<string[]>().default([]),
  joinCode: varchar("join_code").unique(),
  createdAt: timestamp("created_at").defaultNow(),
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
  studentId: varchar("student_id").notNull(),
  classId: varchar("class_id").notNull(),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
});

export type Enrollment = typeof enrollments.$inferSelect;
export type InsertEnrollment = typeof enrollments.$inferInsert;

// Exams table
export const exams = pgTable("exams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title").notNull(),
  professorId: varchar("professor_id").notNull(),
  classId: varchar("class_id"),
  questions: jsonb("questions").notNull().$type<Question[]>(),
  startTime: varchar("start_time"),
  endTime: varchar("end_time"),
  assignedStudentIds: jsonb("assigned_student_ids").notNull().$type<string[]>().default([]),
  assignedStudentNames: jsonb("assigned_student_names").notNull().$type<string[]>().default([]),
  accessCode: varchar("access_code").unique(),
  accessCodeExpiresAt: timestamp("access_code_expires_at"),
  mode: varchar("mode").notNull().default("exam"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Exam = typeof exams.$inferSelect;

export const insertExamSchema = z.object({
  title: z.string().min(1, "Exam title is required"),
  questions: z.array(insertQuestionSchema).min(1, "At least one question is required"),
  classId: z.string().optional().nullable(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  assignedStudentIds: z.array(z.string()).optional(),
  assignedStudentNames: z.array(z.string()).optional(),
  professorId: z.string().optional(),
  customAccessCode: z.string().max(10).optional(),
  autoGenerateCode: z.boolean().optional(),
  mode: z.enum(["exam", "quickvox"]).optional().default("exam"),
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

// Submissions table
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  examId: varchar("exam_id").notNull(),
  studentId: varchar("student_id").notNull(),
  responses: jsonb("responses").notNull().$type<ExamResponse[]>(),
  scores: jsonb("scores").notNull().$type<Record<string, number>>(),
  understandingScores: jsonb("understanding_scores").$type<Record<string, number>>(),
  gradingMethods: jsonb("grading_methods").$type<Record<string, GradingMethod>>(),
  totalScore: real("total_score").notNull(),
  totalUnderstandingScore: real("total_understanding_score"),
  feedback: jsonb("feedback").$type<{ strengths: string; weakPoints: string; recommendations: string } | null>(),
  isPreview: varchar("is_preview").default("false"),
  screenRecordingUrl: varchar("screen_recording_url"),
  webcamRecordingUrl: varchar("webcam_recording_url"),
  proctoringFlags: jsonb("proctoring_flags").$type<ProctoringFlag[]>(),
  tabSwitchCount: real("tab_switch_count").default(0),
  isSuspicious: varchar("is_suspicious").default("false"),
  quickvoxInsight: text("quickvox_insight"),
  quickvoxFollowUp: text("quickvox_follow_up"),
  submittedAt: varchar("submitted_at").notNull(),
});

export type ExamSubmission = typeof submissions.$inferSelect;

export const insertExamSubmissionSchema = z.object({
  examId: z.string(),
  responses: z.array(examResponseSchema),
  studentId: z.string().optional(),
  isPreview: z.boolean().optional(),
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

export const submissionsRelations = relations(submissions, ({ one }) => ({
  exam: one(exams, { fields: [submissions.examId], references: [exams.id] }),
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
