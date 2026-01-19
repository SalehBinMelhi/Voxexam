import { z } from "zod";

export const questionTypes = ["mcq", "short", "audio"] as const;
export type QuestionType = typeof questionTypes[number];

export const userRoles = ["professor", "student"] as const;
export type UserRole = typeof userRoles[number];

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

export const examSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Exam title is required"),
  professorId: z.string(),
  questions: z.array(questionSchema),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  assignedStudentIds: z.array(z.string()),
  assignedStudentNames: z.array(z.string()),
});

export type Exam = z.infer<typeof examSchema>;

export const insertExamSchema = z.object({
  title: z.string().min(1, "Exam title is required"),
  questions: z.array(insertQuestionSchema).min(1, "At least one question is required"),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  assignedStudentIds: z.array(z.string()).optional(),
  assignedStudentNames: z.array(z.string()).optional(),
  professorId: z.string().optional(),
});

export type InsertExam = z.infer<typeof insertExamSchema>;

export const userSchema = z.object({
  id: z.string(),
  username: z.string().min(1, "Username is required"),
  role: z.enum(userRoles),
});

export type User = z.infer<typeof userSchema>;

export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  role: z.enum(userRoles),
});

export type InsertUser = z.infer<typeof insertUserSchema>;

export const examResponseSchema = z.object({
  questionId: z.string(),
  response: z.string(),
  audioData: z.string().optional(),
});

export type ExamResponse = z.infer<typeof examResponseSchema>;

export const examSubmissionSchema = z.object({
  id: z.string(),
  examId: z.string(),
  studentId: z.string(),
  responses: z.array(examResponseSchema),
  scores: z.record(z.string(), z.number()),
  totalScore: z.number(),
  submittedAt: z.string(),
});

export type ExamSubmission = z.infer<typeof examSubmissionSchema>;

export const insertExamSubmissionSchema = z.object({
  examId: z.string(),
  responses: z.array(examResponseSchema),
  studentId: z.string().optional(),
});

export type InsertExamSubmission = z.infer<typeof insertExamSubmissionSchema>;
