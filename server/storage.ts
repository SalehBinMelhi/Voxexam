import { randomUUID } from "crypto";
import type {
  User,
  InsertUser,
  Exam,
  InsertExam,
  Question,
  InsertQuestion,
  ExamSubmission,
  InsertExamSubmission,
  ExamResponse,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  getExam(id: string): Promise<Exam | undefined>;
  getAllExams(): Promise<Exam[]>;
  createExam(professorId: string, exam: InsertExam): Promise<Exam>;
  updateExam(id: string, exam: Partial<InsertExam>): Promise<Exam | undefined>;
  deleteExam(id: string): Promise<boolean>;

  getSubmission(id: string): Promise<ExamSubmission | undefined>;
  getSubmissionsByExam(examId: string): Promise<ExamSubmission[]>;
  getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]>;
  getAllSubmissions(): Promise<ExamSubmission[]>;
  createSubmission(
    studentId: string,
    examId: string,
    responses: ExamResponse[]
  ): Promise<ExamSubmission>;
}

function evaluateResponse(
  question: Question,
  response: string
): number {
  if (question.type === "mcq") {
    return response.trim().toLowerCase() ===
      (question.correctAnswer || "").toLowerCase()
      ? 1.0
      : 0.0;
  }

  if (!question.correctAnswer) {
    return 0.0;
  }

  const correctWords = new Set(
    question.correctAnswer.toLowerCase().split(/\s+/)
  );
  const responseWords = new Set(response.toLowerCase().split(/\s+/));
  const commonWords = [...correctWords].filter((w) => responseWords.has(w));

  return correctWords.size > 0 ? commonWords.length / correctWords.size : 0.0;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private exams: Map<string, Exam>;
  private submissions: Map<string, ExamSubmission>;

  constructor() {
    this.users = new Map();
    this.exams = new Map();
    this.submissions = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase()
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getExam(id: string): Promise<Exam | undefined> {
    return this.exams.get(id);
  }

  async getAllExams(): Promise<Exam[]> {
    return Array.from(this.exams.values());
  }

  async createExam(professorId: string, insertExam: InsertExam): Promise<Exam> {
    const id = randomUUID();
    const questions: Question[] = insertExam.questions.map((q) => ({
      ...q,
      id: randomUUID(),
    }));

    const exam: Exam = {
      id,
      title: insertExam.title,
      professorId,
      questions,
      startTime: insertExam.startTime || null,
      endTime: insertExam.endTime || null,
      assignedStudentIds: insertExam.assignedStudentIds || [],
      assignedStudentNames: insertExam.assignedStudentNames || [],
    };

    this.exams.set(id, exam);
    return exam;
  }

  async updateExam(
    id: string,
    updates: Partial<InsertExam>
  ): Promise<Exam | undefined> {
    const exam = this.exams.get(id);
    if (!exam) return undefined;

    const updatedExam: Exam = {
      ...exam,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.startTime !== undefined && { startTime: updates.startTime }),
      ...(updates.endTime !== undefined && { endTime: updates.endTime }),
      ...(updates.assignedStudentIds !== undefined && {
        assignedStudentIds: updates.assignedStudentIds,
      }),
      ...(updates.assignedStudentNames !== undefined && {
        assignedStudentNames: updates.assignedStudentNames,
      }),
    };

    this.exams.set(id, updatedExam);
    return updatedExam;
  }

  async deleteExam(id: string): Promise<boolean> {
    return this.exams.delete(id);
  }

  async getSubmission(id: string): Promise<ExamSubmission | undefined> {
    return this.submissions.get(id);
  }

  async getSubmissionsByExam(examId: string): Promise<ExamSubmission[]> {
    return Array.from(this.submissions.values()).filter(
      (s) => s.examId === examId
    );
  }

  async getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]> {
    return Array.from(this.submissions.values()).filter(
      (s) => s.studentId === studentId
    );
  }

  async getAllSubmissions(): Promise<ExamSubmission[]> {
    return Array.from(this.submissions.values());
  }

  async createSubmission(
    studentId: string,
    examId: string,
    responses: ExamResponse[]
  ): Promise<ExamSubmission> {
    const exam = await this.getExam(examId);
    if (!exam) {
      throw new Error("Exam not found");
    }

    const id = randomUUID();
    const scores: Record<string, number> = {};

    for (const response of responses) {
      const question = exam.questions.find((q) => q.id === response.questionId);
      if (question) {
        scores[response.questionId] = evaluateResponse(question, response.response);
      }
    }

    const totalScore =
      Object.values(scores).length > 0
        ? Object.values(scores).reduce((a, b) => a + b, 0) /
          Object.values(scores).length
        : 0;

    const submission: ExamSubmission = {
      id,
      examId,
      studentId,
      responses,
      scores,
      totalScore,
      submittedAt: new Date().toISOString(),
    };

    this.submissions.set(id, submission);
    return submission;
  }
}

export const storage = new MemStorage();
