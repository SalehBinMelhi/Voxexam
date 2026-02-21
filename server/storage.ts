import { randomUUID } from "crypto";
import OpenAI, { toFile } from "openai";
import type {
  User,
  InsertUser,
  Exam,
  InsertExam,
  Question,
  ExamSubmission,
  ExamResponse,
  GradingMethod,
} from "@shared/schema";
import { ensureCompatibleFormat, speechToText } from "./replit_integrations/audio/client";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function transcribeAudio(audioDataUrl: string): Promise<string> {
  try {
    console.log("[AUDIO] Starting audio transcription, data URL length:", audioDataUrl.length);
    
    const base64Separator = ";base64,";
    const separatorIndex = audioDataUrl.indexOf(base64Separator);
    
    if (separatorIndex === -1) {
      console.error("[AUDIO] Invalid audio data URL format - no ;base64, separator found");
      console.error("[AUDIO] Received prefix:", audioDataUrl.substring(0, 100));
      return "";
    }
    
    const metadataPart = audioDataUrl.substring(0, separatorIndex);
    const base64Data = audioDataUrl.substring(separatorIndex + base64Separator.length);
    
    console.log("[AUDIO] Metadata:", metadataPart);
    console.log("[AUDIO] Base64 data length:", base64Data.length);
    
    const audioBuffer = Buffer.from(base64Data, "base64");
    console.log("[AUDIO] Audio buffer size:", audioBuffer.length, "bytes");

    if (audioBuffer.length < 1000) {
      console.error("[AUDIO] Audio buffer too small, likely invalid recording");
      return "";
    }

    const { buffer: compatibleBuffer, format: compatibleFormat } = await ensureCompatibleFormat(audioBuffer);
    console.log("[AUDIO] Converted to compatible format:", compatibleFormat, "buffer size:", compatibleBuffer.length);

    console.log("[AUDIO] Sending to gpt-4o-mini-transcribe for speech-to-text...");
    const transcription = await speechToText(compatibleBuffer, compatibleFormat);

    console.log("[AUDIO] Transcription result:", transcription);
    return transcription || "";
  } catch (error: any) {
    console.error("[AUDIO] Transcription failed with error:", error?.message || error);
    if (error?.response?.data) {
      console.error("[AUDIO] API response:", JSON.stringify(error.response.data));
    }
    return "";
  }
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByUsernameAndRole(username: string, role: string): Promise<User | undefined>;
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
  updateSubmissionScore(
    submissionId: string,
    questionId: string,
    newScore: number
  ): Promise<ExamSubmission | undefined>;
}

interface EvalResult {
  score: number;
  method: GradingMethod;
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

    console.log("[AI-GRADING] Sending to GPT-4o-mini for evaluation...");
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
      temperature: 0.1,
    });

    const scoreText = completion.choices[0]?.message?.content?.trim() || "0";
    const score = parseFloat(scoreText);
    
    if (isNaN(score) || score < 0 || score > 1) {
      console.warn(`[AI-GRADING] AI returned invalid score: ${scoreText}, falling back to word matching`);
      return { score: fallbackScore(question, response), method: "fallback" };
    }
    
    console.log(`[AI-GRADING] AI score: ${score}`);
    return { score, method: "ai" };
  } catch (error) {
    console.error("[AI-GRADING] AI grading failed, using fallback:", error);
    return { score: fallbackScore(question, response), method: "fallback" };
  }
}

function fallbackScore(question: Question, response: string): number {
  if (!question.correctAnswer) {
    return 0.0;
  }

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
  console.log(`[AI-GRADING] Evaluating question type: ${question.type}, hasAudio: ${!!audioData}, textResponse: "${response?.substring(0, 50)}..."`);
  
  if (question.type === "mcq") {
    const score = response.trim().toLowerCase() ===
      (question.correctAnswer || "").toLowerCase()
      ? 1.0
      : 0.0;
    console.log(`[AI-GRADING] MCQ exact match score: ${score}`);
    return { score, method: "exact" };
  }

  if (question.type === "audio" && audioData && audioData.length > 0) {
    console.log("[AI-GRADING] Processing audio question with recording data");
    const transcription = await transcribeAudio(audioData);
    if (transcription) {
      console.log(`[AI-GRADING] Audio transcribed: "${transcription}"`);
      return evaluateWithAI(question, transcription);
    }
    console.log("[AI-GRADING] Transcription failed, checking for text fallback");
    if (response && response.trim().length > 0) {
      return evaluateWithAI(question, response);
    }
    console.log("[AI-GRADING] No text fallback, returning 0");
    return { score: 0.0, method: "fallback" };
  }

  if (question.type === "audio" && response && response.trim().length > 0) {
    console.log("[AI-GRADING] Audio question with text-only response");
    return evaluateWithAI(question, response);
  }

  if (!response || response.trim().length === 0) {
    console.log("[AI-GRADING] Empty response, returning 0");
    return { score: 0.0, method: "fallback" };
  }

  return evaluateWithAI(question, response);
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

  async getUserByUsernameAndRole(username: string, role: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username.toLowerCase() === username.toLowerCase() && user.role === role
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
    const gradingMethodsMap: Record<string, "ai" | "fallback" | "exact" | "manual"> = {};

    for (const response of responses) {
      const question = exam.questions.find((q) => q.id === response.questionId);
      if (question) {
        const result = await evaluateResponse(
          question,
          response.response,
          response.audioData
        );
        scores[response.questionId] = result.score;
        gradingMethodsMap[response.questionId] = result.method;
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
      gradingMethods: gradingMethodsMap,
      totalScore,
      submittedAt: new Date().toISOString(),
    };

    this.submissions.set(id, submission);
    return submission;
  }

  async updateSubmissionScore(
    submissionId: string,
    questionId: string,
    newScore: number
  ): Promise<ExamSubmission | undefined> {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      return undefined;
    }

    // Clamp score between 0 and 1
    const clampedScore = Math.max(0, Math.min(1, newScore));
    
    submission.scores[questionId] = clampedScore;
    if (!submission.gradingMethods) {
      submission.gradingMethods = {};
    }
    submission.gradingMethods[questionId] = "manual";
    
    // Recalculate total score
    const scores = Object.values(submission.scores);
    submission.totalScore = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    this.submissions.set(submissionId, submission);
    return submission;
  }
}

export const storage = new MemStorage();
