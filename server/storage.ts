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
  classMaterials,
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
  type ClassMaterial,
  type InsertClassMaterial,
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
  understandingScore: number;
  method: GradingMethod;
  transcript?: string;
}

async function evaluateWithAI(
  question: Question,
  response: string,
  materialContext?: string,
  customApiKey?: string | null
): Promise<EvalResult> {
  try {
    const materialSection = materialContext
      ? `\nClass Materials Context (use this to assess the answer):\n${materialContext}\n`
      : "";

    const prompt = `You are grading a student's answer to an oral exam question. You must provide TWO separate scores.
${materialSection}
Question: ${question.text}

Expected Answer: ${question.correctAnswer || "No specific expected answer provided"}

Student's Answer: ${response}

Please evaluate with TWO scores, each from 0.0 to 1.0:

1. CORRECTNESS SCORE: Is the answer factually correct?
- 1.0 = Completely correct
- 0.75-0.99 = Mostly correct with minor inaccuracies
- 0.5-0.74 = Partially correct
- 0.25-0.49 = Mostly incorrect
- 0.0-0.24 = Wrong or no relevant content

2. UNDERSTANDING SCORE: Does the student demonstrate understanding of the subject?
- 1.0 = Correct answer that fully addresses the question's complexity
- 0.75-0.99 = Good understanding with clear reasoning
- 0.5-0.74 = Partial understanding, missing key concepts
- 0.25-0.49 = Superficial understanding, major gaps in reasoning
- 0.0-0.24 = No demonstrated understanding

IMPORTANT: For simple, objective, or factual questions (e.g., basic math, definitions, single-fact recall), a correct and concise answer IS sufficient proof of understanding. Do NOT penalize brevity when the question itself is straightforward — a short correct answer to a simple question deserves a high understanding score (0.9-1.0). Only expect detailed explanations for complex, analytical, or open-ended questions.

Respond with ONLY two numbers separated by a comma, like: 0.8,0.6
The first number is correctness, the second is understanding.`;

    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0.1,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "0,0";
    const parts = responseText.split(",").map(s => parseFloat(s.trim()));
    
    const correctness = parts[0];
    const understanding = parts.length > 1 ? parts[1] : parts[0];
    
    if (isNaN(correctness) || correctness < 0 || correctness > 1 ||
        isNaN(understanding) || understanding < 0 || understanding > 1) {
      const fb = fallbackScore(question, response);
      return { score: fb, understandingScore: fb, method: "fallback" };
    }
    
    return { score: correctness, understandingScore: understanding, method: "ai" };
  } catch (error) {
    console.error("[AI-GRADING] AI grading failed, using fallback:", error);
    const fb = fallbackScore(question, response);
    return { score: fb, understandingScore: fb, method: "fallback" };
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
  audioData?: string,
  materialContext?: string,
  customApiKey?: string | null
): Promise<EvalResult> {
  if (question.type === "mcq") {
    const score = response.trim().toLowerCase() === (question.correctAnswer || "").toLowerCase() ? 1.0 : 0.0;
    return { score, understandingScore: score, method: "exact" };
  }

  if (question.type === "audio" && audioData && audioData.length > 0) {
    const transcription = await transcribeAudio(audioData);
    if (transcription) {
      const result = await evaluateWithAI(question, transcription, materialContext, customApiKey);
      return { ...result, transcript: transcription };
    }
    if (response && response.trim().length > 0) {
      return evaluateWithAI(question, response, materialContext, customApiKey);
    }
    return { score: 0.0, understandingScore: 0.0, method: "fallback" };
  }

  if (question.type === "audio" && response && response.trim().length > 0) {
    return evaluateWithAI(question, response, materialContext, customApiKey);
  }

  if (!response || response.trim().length === 0) {
    return { score: 0.0, understandingScore: 0.0, method: "fallback" };
  }

  return evaluateWithAI(question, response, materialContext, customApiKey);
}

export async function generateQuestionsFromMaterials(
  materialContent: string,
  numQuestions: number = 5,
  questionTypes: string[] = ["short", "mcq", "audio"],
  customApiKey?: string | null,
  instructions?: string | null
): Promise<Array<{ text: string; type: string; options?: string[]; correctAnswer?: string }>> {
  try {
    const client = customApiKey
      ? new OpenAI({ apiKey: customApiKey })
      : openai;

    const typesStr = questionTypes.join(", ");
    const hasInstructions = !!(instructions && instructions.trim());
    const instructionsSection = hasInstructions
      ? `\nProfessor's Instructions (HIGHEST PRIORITY — follow these exactly):\n${instructions!.trim()}\n`
      : "";

    const numNote = hasInstructions
      ? `The professor's instructions above take priority. If the professor specifies a number of questions (e.g., "give me 1 question", "3 questions"), generate EXACTLY that many. If no number is mentioned in the instructions, generate ${numQuestions} questions.`
      : `Generate exactly ${numQuestions} questions.`;

    const prompt = `You are an expert exam creator. Based on the following course materials, generate exam questions.
${instructionsSection}
Course Materials:
${materialContent.substring(0, 12000)}

${numNote} For each question, choose the most appropriate type from: ${typesStr}

Rules:
- "short" = short answer question (student writes a text response)
- "mcq" = multiple choice question (provide 4 options, one correct)
- "audio" = audio response question (student answers verbally - use for questions that benefit from oral explanation)
- Mix the question types for variety unless the professor specified otherwise
- Questions should test both knowledge recall and deeper understanding
- For MCQ, always provide exactly 4 options
- Always provide a correctAnswer
- The professor's instructions above override ALL other guidelines including number of questions, topic focus, difficulty level, question style, and question types

Respond with a JSON array of objects, each with:
- "text": the question text
- "type": "short" | "mcq" | "audio"
- "options": array of 4 strings (only for mcq type)
- "correctAnswer": the correct/expected answer

Respond with ONLY the JSON array, no other text.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "[]";
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((q: any) => ({
      text: q.text || "",
      type: questionTypes.includes(q.type) ? q.type : "short",
      options: q.type === "mcq" && Array.isArray(q.options) ? q.options : undefined,
      correctAnswer: q.correctAnswer || undefined,
    }));
  } catch (error) {
    console.error("[AI-GENERATE] Question generation failed:", error);
    throw new Error("Failed to generate questions from materials");
  }
}

export async function generateFeedback(
  exam: { questions: Array<{ id: string; text: string; type: string; correctAnswer?: string }> },
  responses: ExamResponse[],
  scores: Record<string, number>,
  understandingScores: Record<string, number>,
  materialContext?: string,
  customApiKey?: string | null
): Promise<{ strengths: string; weakPoints: string; recommendations: string }> {
  try {
    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;

    const questionResults = responses.map((resp) => {
      const question = exam.questions.find((q) => q.id === resp.questionId);
      return {
        question: question?.text || "Unknown question",
        expectedAnswer: question?.correctAnswer || "N/A",
        studentAnswer: resp.transcript || resp.response || "No answer",
        correctnessScore: Math.round((scores[resp.questionId] || 0) * 100),
        understandingScore: Math.round((understandingScores[resp.questionId] || 0) * 100),
      };
    });

    const prompt = `You are an expert academic evaluator. Analyze this student's exam performance and provide feedback.

${materialContext ? `Course Materials Context:\n${materialContext.substring(0, 4000)}\n` : ""}

Student's Performance:
${JSON.stringify(questionResults, null, 2)}

Provide a JSON object with exactly these three fields:
- "strengths": What the student did well. Be specific about which topics or concepts they demonstrated knowledge in.
- "weakPoints": Specific areas where the student struggled or showed gaps. If there are no real weaknesses (e.g., all scores are high and questions were straightforward), set this to an empty string "".
- "recommendations": Actionable study recommendations. If the student performed well on all questions, set this to an empty string "".

IMPORTANT RULES:
- Be proportionate to the exam difficulty and results. For simple questions answered correctly, do NOT manufacture weaknesses or recommendations that don't exist.
- If a student scores 90%+ on both correctness and understanding, weakPoints and recommendations should be empty strings unless there are genuine areas for improvement.
- Keep feedback concise and genuinely useful — avoid padding with generic advice.
- Never criticize brevity on simple factual or arithmetic questions.

Respond with ONLY the JSON object, no other text.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.5,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "{}";
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { strengths: "Unable to generate feedback.", weakPoints: "", recommendations: "" };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      strengths: parsed.strengths || "",
      weakPoints: parsed.weakPoints || parsed.weak_points || "",
      recommendations: parsed.recommendations || "",
    };
  } catch (error) {
    console.error("[AI-FEEDBACK] Feedback generation failed:", error);
    return { strengths: "Feedback generation failed.", weakPoints: "", recommendations: "" };
  }
}

export async function analyzeProctoringScreenshot(
  screenshots: string[],
  labels: string[],
  examTitle: string,
  customApiKey?: string | null
): Promise<string> {
  try {
    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;

    const imageMessages = screenshots.map((ss) => ({
      type: "image_url" as const,
      image_url: { url: ss, detail: "low" as const },
    }));

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `You are an exam proctoring AI. The student was taking an exam called "${examTitle}" in a web browser. A tab switch was detected. Analyze these ${screenshots.length} screenshot(s) taken ${labels.join(", ")}.\n\nDetermine: Was the student on the exam page or did they navigate to a different page/application? Respond with a SHORT verdict (1-2 sentences max), e.g. "Student switched to Google search" or "Student appeared to remain on the exam page" or "Student opened a notes application".` },
          ...imageMessages,
        ],
      }],
      max_tokens: 100,
      temperature: 0.1,
    });
    return completion.choices[0]?.message?.content?.trim() || "Tab switch detected";
  } catch (error) {
    console.error("[PROCTORING] AI analysis failed:", error);
    return "Tab switch detected (AI analysis unavailable)";
  }
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserRole(userId: string, role: string, universityId?: string): Promise<User | undefined>;
  updateUserApiKey(userId: string, apiKey: string | null): Promise<User | undefined>;

  // Universities
  getUniversity(id: string): Promise<University | undefined>;
  getAllUniversities(): Promise<University[]>;
  createUniversity(data: InsertUniversity): Promise<University>;
  updateUniversityApiKey(universityId: string, apiKey: string | null): Promise<University | undefined>;

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

  // Class Materials
  getMaterialsByClass(classId: string): Promise<ClassMaterial[]>;
  createMaterial(data: InsertClassMaterial): Promise<ClassMaterial>;
  deleteMaterial(id: string): Promise<boolean>;

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
  createSubmission(studentId: string, examId: string, responses: ExamResponse[], isPreview?: boolean): Promise<ExamSubmission>;
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

  async updateUserApiKey(userId: string, apiKey: string | null): Promise<User | undefined> {
    const [user] = await db.update(users).set({ openaiApiKey: apiKey, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
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

  async updateUniversityApiKey(universityId: string, apiKey: string | null): Promise<University | undefined> {
    const [uni] = await db.update(universities).set({ openaiApiKey: apiKey }).where(eq(universities.id, universityId)).returning();
    return uni || undefined;
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

  // Class Materials
  async getMaterialsByClass(classId: string): Promise<ClassMaterial[]> {
    return db.select().from(classMaterials).where(eq(classMaterials.classId, classId));
  }

  async createMaterial(data: InsertClassMaterial): Promise<ClassMaterial> {
    const [material] = await db.insert(classMaterials).values(data).returning();
    return material;
  }

  async deleteMaterial(id: string): Promise<boolean> {
    const result = await db.delete(classMaterials).where(eq(classMaterials.id, id)).returning();
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
    responses: ExamResponse[],
    isPreview: boolean = false
  ): Promise<ExamSubmission> {
    const exam = await this.getExam(examId);
    if (!exam) throw new Error("Exam not found");

    let materialContext = "";
    if (exam.classId) {
      const materials = await this.getMaterialsByClass(exam.classId);
      if (materials.length > 0) {
        const combinedContent = materials.map(m => `--- ${m.fileName} ---\n${m.content}`).join("\n\n");
        materialContext = combinedContent.length > 8000 
          ? combinedContent.substring(0, 8000) + "\n[Content truncated for length]"
          : combinedContent;
      }
    }

    const professor = await this.getUser(exam.professorId);
    let customApiKey: string | null = null;
    if (professor?.universityId) {
      const uni = await this.getUniversity(professor.universityId);
      if (uni?.openaiApiKey) customApiKey = uni.openaiApiKey;
    }

    const scores: Record<string, number> = {};
    const understandingScoresMap: Record<string, number> = {};
    const gradingMethodsMap: Record<string, GradingMethod> = {};

    for (const response of responses) {
      const question = exam.questions.find((q) => q.id === response.questionId);
      if (question) {
        const result = await evaluateResponse(question, response.response, response.audioData, materialContext || undefined, customApiKey);
        scores[response.questionId] = result.score;
        understandingScoresMap[response.questionId] = result.understandingScore;
        gradingMethodsMap[response.questionId] = result.method;
        if (result.transcript) {
          response.transcript = result.transcript;
        }
      }
    }

    const scoreValues = Object.values(scores);
    const totalScore = scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;

    const understandingValues = Object.values(understandingScoresMap);
    const totalUnderstandingScore = understandingValues.length > 0
      ? understandingValues.reduce((a, b) => a + b, 0) / understandingValues.length
      : 0;

    let feedback: { strengths: string; weakPoints: string; recommendations: string } | null = null;
    try {
      feedback = await generateFeedback(exam, responses, scores, understandingScoresMap, materialContext || undefined, customApiKey);
    } catch (e) {
      console.error("[AI-FEEDBACK] Failed to generate feedback during submission:", e);
    }

    const [submission] = await db.insert(submissions).values({
      examId,
      studentId,
      responses,
      scores,
      understandingScores: understandingScoresMap,
      gradingMethods: gradingMethodsMap,
      totalScore,
      totalUnderstandingScore,
      feedback,
      isPreview: isPreview ? "true" : "false",
      submittedAt: new Date().toISOString(),
    }).returning();

    return submission;
  }

  async updateSubmissionScore(
    submissionId: string,
    questionId: string,
    newScore: number,
    newUnderstandingScore?: number
  ): Promise<ExamSubmission | undefined> {
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    if (!sub) return undefined;

    const clampedScore = Math.max(0, Math.min(1, newScore));
    const updatedScores = { ...sub.scores, [questionId]: clampedScore };
    const updatedMethods = { ...(sub.gradingMethods || {}), [questionId]: "manual" as GradingMethod };

    const updatedUnderstanding = { ...(sub.understandingScores || {}) };
    if (newUnderstandingScore !== undefined) {
      updatedUnderstanding[questionId] = Math.max(0, Math.min(1, newUnderstandingScore));
    }

    const scoreValues = Object.values(updatedScores);
    const newTotalScore = scoreValues.length > 0
      ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
      : 0;

    const understandingValues = Object.values(updatedUnderstanding);
    const newTotalUnderstanding = understandingValues.length > 0
      ? understandingValues.reduce((a, b) => a + b, 0) / understandingValues.length
      : 0;

    const [updated] = await db.update(submissions).set({
      scores: updatedScores,
      understandingScores: updatedUnderstanding,
      gradingMethods: updatedMethods,
      totalScore: newTotalScore,
      totalUnderstandingScore: newTotalUnderstanding,
    }).where(eq(submissions.id, submissionId)).returning();

    return updated || undefined;
  }
}

export const storage = new DatabaseStorage();
