import OpenAI, { toFile } from "openai";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  universities,
  classes,
  enrollments,
  exams,
  submissions,
  type User,
  type University,
  type InsertUniversity,
  type Class,
  type InsertClass,
  type Enrollment,
  type InsertEnrollment,
  type Exam,
  type InsertExam,
  type ExamSubmission,
  type ExamResponse,
  type Question,
  type GradingMethod,
} from "@shared/schema";
import { ensureCompatibleFormat, speechToText } from "./replit_integrations/audio/client";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function transcribeAudio(audioDataUrl: string): Promise<string> {
  try {
    console.log("[AUDIO] Starting audio transcription, data URL length:", audioDataUrl.length);
    
    const base64Separator = ";base64,";
    const separatorIndex = audioDataUrl.indexOf(base64Separator);
    
    if (separatorIndex === -1) {
      console.error("[AUDIO] Invalid audio data URL format - no ;base64, separator found");
      return "";
    }
    
    const metadataPart = audioDataUrl.substring(0, separatorIndex);
    const base64Data = audioDataUrl.substring(separatorIndex + base64Separator.length);
    
    console.log("[AUDIO] Metadata:", metadataPart);
    
    const audioBuffer = Buffer.from(base64Data, "base64");
    console.log("[AUDIO] Audio buffer size:", audioBuffer.length, "bytes");

    if (audioBuffer.length < 1000) {
      console.error("[AUDIO] Audio buffer too small, likely invalid recording");
      return "";
    }

    const { buffer: compatibleBuffer, format: compatibleFormat } = await ensureCompatibleFormat(audioBuffer);
    console.log("[AUDIO] Converted to compatible format:", compatibleFormat);

    const transcription = await speechToText(compatibleBuffer, compatibleFormat);

    console.log("[AUDIO] Transcription result:", transcription);
    return transcription || "";
  } catch (error: any) {
    console.error("[AUDIO] Transcription failed:", error?.message || error);
    return "";
  }
}

interface EvalResult {
  score: number;
  method: GradingMethod;
  transcript?: string;
}

async function evaluateWithAI(
  question: Question,
  response: string
): Promise<EvalResult> {
  try {
    const prompt = `You are grading a student's answer to an exam question. 

Question: ${question.text}

Expected Answer: ${question.correctAnswer}

Student's Answer: ${response}

Grade the student's answer on a scale from 0.0 to 1.0, where:
- 1.0 = Perfect or nearly perfect answer that demonstrates full understanding
- 0.75-0.99 = Good answer with minor omissions or inaccuracies
- 0.5-0.74 = Partial understanding, missing key points
- 0.25-0.49 = Minimal understanding, significant errors
- 0.0-0.24 = Incorrect or no relevant content

Consider semantic meaning and understanding, not just exact word matching. Be fair but rigorous.

Respond with ONLY a number between 0.0 and 1.0, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    });

    const scoreText = completion.choices[0]?.message?.content?.trim() || "0";
    const score = parseFloat(scoreText);
    
    if (isNaN(score) || score < 0 || score > 1) {
      return { score: fallbackScore(question, response), method: "fallback" };
    }
    
    return { score, method: "ai" };
  } catch (error) {
    console.error("[AI-GRADING] AI grading failed, using fallback:", error);
    return { score: fallbackScore(question, response), method: "fallback" };
  }
}

function fallbackScore(question: Question, response: string): number {
  if (!question.correctAnswer) return 0.0;
  const correctWords = question.correctAnswer.toLowerCase().split(/\s+/);
  const responseWordsSet = new Set(response.toLowerCase().split(/\s+/));
  const commonWords = correctWords.filter((w) => responseWordsSet.has(w));
  return correctWords.length > 0 ? commonWords.length / correctWords.length : 0.0;
}

async function evaluateResponse(
  question: Question,
  response: string,
  audioData?: string
): Promise<EvalResult> {
  if (question.type === "mcq") {
    const score = response.trim().toLowerCase() === (question.correctAnswer || "").toLowerCase() ? 1.0 : 0.0;
    return { score, method: "exact" };
  }

  if (question.type === "audio" && audioData && audioData.length > 0) {
    const transcription = await transcribeAudio(audioData);
    if (transcription) {
      const result = await evaluateWithAI(question, transcription);
      return { ...result, transcript: transcription };
    }
    if (response && response.trim().length > 0) {
      return evaluateWithAI(question, response);
    }
    return { score: 0.0, method: "fallback" };
  }

  if (question.type === "audio" && response && response.trim().length > 0) {
    return evaluateWithAI(question, response);
  }

  if (!response || response.trim().length === 0) {
    return { score: 0.0, method: "fallback" };
  }

  return evaluateWithAI(question, response);
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string, universityId?: string): Promise<User | undefined>;

  // Universities
  getUniversity(id: string): Promise<University | undefined>;
  getAllUniversities(): Promise<University[]>;
  createUniversity(data: InsertUniversity): Promise<University>;

  // Classes
  getClass(id: string): Promise<Class | undefined>;
  getClassesByUniversity(universityId: string): Promise<Class[]>;
  getClassesByProfessor(professorId: string): Promise<Class[]>;
  createClass(data: InsertClass): Promise<Class>;
  deleteClass(id: string): Promise<boolean>;

  // Enrollments
  getEnrollmentsByClass(classId: string): Promise<Enrollment[]>;
  getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]>;
  createEnrollment(data: InsertEnrollment): Promise<Enrollment>;
  deleteEnrollment(studentId: string, classId: string): Promise<boolean>;

  // Exams
  getExam(id: string): Promise<Exam | undefined>;
  getAllExams(): Promise<Exam[]>;
  getExamsByClass(classId: string): Promise<Exam[]>;
  getExamsByProfessor(professorId: string): Promise<Exam[]>;
  createExam(professorId: string, exam: InsertExam): Promise<Exam>;
  updateExam(id: string, exam: Partial<InsertExam>): Promise<Exam | undefined>;
  deleteExam(id: string): Promise<boolean>;

  // Submissions
  getSubmission(id: string): Promise<ExamSubmission | undefined>;
  getSubmissionsByExam(examId: string): Promise<ExamSubmission[]>;
  getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]>;
  getAllSubmissions(): Promise<ExamSubmission[]>;
  createSubmission(studentId: string, examId: string, responses: ExamResponse[]): Promise<ExamSubmission>;
  updateSubmissionScore(submissionId: string, questionId: string, newScore: number): Promise<ExamSubmission | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async updateUserRole(userId: string, role: string, universityId?: string): Promise<User | undefined> {
    const updates: any = { role, updatedAt: new Date() };
    if (universityId !== undefined) updates.universityId = universityId;
    const [user] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return user || undefined;
  }

  // Universities
  async getUniversity(id: string): Promise<University | undefined> {
    const [uni] = await db.select().from(universities).where(eq(universities.id, id));
    return uni || undefined;
  }

  async getAllUniversities(): Promise<University[]> {
    return db.select().from(universities);
  }

  async createUniversity(data: InsertUniversity): Promise<University> {
    const [uni] = await db.insert(universities).values(data).returning();
    return uni;
  }

  // Classes
  async getClass(id: string): Promise<Class | undefined> {
    const [cls] = await db.select().from(classes).where(eq(classes.id, id));
    return cls || undefined;
  }

  async getClassesByUniversity(universityId: string): Promise<Class[]> {
    return db.select().from(classes).where(eq(classes.universityId, universityId));
  }

  async getClassesByProfessor(professorId: string): Promise<Class[]> {
    return db.select().from(classes).where(eq(classes.professorId, professorId));
  }

  async createClass(data: InsertClass): Promise<Class> {
    const [cls] = await db.insert(classes).values(data).returning();
    return cls;
  }

  async deleteClass(id: string): Promise<boolean> {
    const result = await db.delete(classes).where(eq(classes.id, id)).returning();
    return result.length > 0;
  }

  // Enrollments
  async getEnrollmentsByClass(classId: string): Promise<Enrollment[]> {
    return db.select().from(enrollments).where(eq(enrollments.classId, classId));
  }

  async getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
    return db.select().from(enrollments).where(eq(enrollments.studentId, studentId));
  }

  async createEnrollment(data: InsertEnrollment): Promise<Enrollment> {
    const [enrollment] = await db.insert(enrollments).values(data).returning();
    return enrollment;
  }

  async deleteEnrollment(studentId: string, classId: string): Promise<boolean> {
    const result = await db.delete(enrollments).where(
      and(eq(enrollments.studentId, studentId), eq(enrollments.classId, classId))
    ).returning();
    return result.length > 0;
  }

  // Exams
  async getExam(id: string): Promise<Exam | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    return exam || undefined;
  }

  async getAllExams(): Promise<Exam[]> {
    return db.select().from(exams);
  }

  async getExamsByClass(classId: string): Promise<Exam[]> {
    return db.select().from(exams).where(eq(exams.classId, classId));
  }

  async getExamsByProfessor(professorId: string): Promise<Exam[]> {
    return db.select().from(exams).where(eq(exams.professorId, professorId));
  }

  async createExam(professorId: string, insertExam: InsertExam): Promise<Exam> {
    const questionsWithIds: Question[] = (insertExam.questions as any[]).map((q) => ({
      ...q,
      id: crypto.randomUUID(),
    }));

    const [exam] = await db.insert(exams).values({
      title: insertExam.title,
      professorId,
      classId: insertExam.classId || null,
      questions: questionsWithIds,
      startTime: insertExam.startTime || null,
      endTime: insertExam.endTime || null,
      assignedStudentIds: insertExam.assignedStudentIds || [],
      assignedStudentNames: insertExam.assignedStudentNames || [],
    }).returning();

    return exam;
  }

  async updateExam(id: string, updates: Partial<InsertExam>): Promise<Exam | undefined> {
    const updateData: any = {};
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.startTime !== undefined) updateData.startTime = updates.startTime;
    if (updates.endTime !== undefined) updateData.endTime = updates.endTime;
    if (updates.assignedStudentIds !== undefined) updateData.assignedStudentIds = updates.assignedStudentIds;
    if (updates.assignedStudentNames !== undefined) updateData.assignedStudentNames = updates.assignedStudentNames;
    if (updates.classId !== undefined) updateData.classId = updates.classId;

    const [exam] = await db.update(exams).set(updateData).where(eq(exams.id, id)).returning();
    return exam || undefined;
  }

  async deleteExam(id: string): Promise<boolean> {
    const result = await db.delete(exams).where(eq(exams.id, id)).returning();
    return result.length > 0;
  }

  // Submissions
  async getSubmission(id: string): Promise<ExamSubmission | undefined> {
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, id));
    return sub || undefined;
  }

  async getSubmissionsByExam(examId: string): Promise<ExamSubmission[]> {
    return db.select().from(submissions).where(eq(submissions.examId, examId));
  }

  async getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]> {
    return db.select().from(submissions).where(eq(submissions.studentId, studentId));
  }

  async getAllSubmissions(): Promise<ExamSubmission[]> {
    return db.select().from(submissions);
  }

  async createSubmission(
    studentId: string,
    examId: string,
    responses: ExamResponse[]
  ): Promise<ExamSubmission> {
    const exam = await this.getExam(examId);
    if (!exam) throw new Error("Exam not found");

    const scores: Record<string, number> = {};
    const gradingMethodsMap: Record<string, GradingMethod> = {};

    for (const response of responses) {
      const question = exam.questions.find((q) => q.id === response.questionId);
      if (question) {
        const result = await evaluateResponse(question, response.response, response.audioData);
        scores[response.questionId] = result.score;
        gradingMethodsMap[response.questionId] = result.method;
        if (result.transcript) {
          response.transcript = result.transcript;
        }
      }
    }

    const totalScore =
      Object.values(scores).length > 0
        ? Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length
        : 0;

    const [submission] = await db.insert(submissions).values({
      examId,
      studentId,
      responses,
      scores,
      gradingMethods: gradingMethodsMap,
      totalScore,
      submittedAt: new Date().toISOString(),
    }).returning();

    return submission;
  }

  async updateSubmissionScore(
    submissionId: string,
    questionId: string,
    newScore: number
  ): Promise<ExamSubmission | undefined> {
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!sub) return undefined;

    const clampedScore = Math.max(0, Math.min(1, newScore));
    const updatedScores = { ...sub.scores, [questionId]: clampedScore };
    const updatedMethods = { ...(sub.gradingMethods || {}), [questionId]: "manual" as GradingMethod };

    const scoreValues = Object.values(updatedScores);
    const newTotalScore = scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;

    const [updated] = await db.update(submissions).set({
      scores: updatedScores,
      gradingMethods: updatedMethods,
      totalScore: newTotalScore,
    }).where(eq(submissions.id, submissionId)).returning();

    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
