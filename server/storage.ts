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

export async function transcribeAudio(audioDataUrl: string, questionContext?: string): Promise<string> {
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

    const prompt = questionContext ? `The student is answering: "${questionContext}". Transcribe their spoken response accurately, using numbers and symbols where appropriate.` : undefined;
    const transcription = await speechToText(compatibleBuffer, compatibleFormat, prompt);

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

    const prompt = `You are a fair, experienced university professor grading a student's oral exam answer. You must provide TWO independent scores. These scores should often be DIFFERENT from each other.
${materialSection}
Question: ${question.text}

Expected Answer: ${question.correctAnswer || "No specific expected answer provided"}

Student's Answer: ${response}

Provide TWO scores from 0.0 to 1.0. These are INDEPENDENT dimensions — a student can score high on one and low on the other:

1. CORRECTNESS SCORE — Are the specific facts, terms, and claims accurate?
Focus ONLY on factual precision. Ask: "Did the student state things that are true?"
- 1.0 = All facts stated are accurate and complete
- 0.8-0.9 = Core facts are right, one or two minor inaccuracies or omissions
- 0.6-0.7 = Main idea is right but contains a factual error or significant omission
- 0.4-0.5 = Mix of correct and incorrect claims
- 0.1-0.3 = Mostly incorrect facts
- 0.0 = Completely wrong or irrelevant

2. UNDERSTANDING SCORE — Does the student genuinely grasp the underlying concept?
Focus on conceptual comprehension, NOT polish or precision of wording. Ask: "Does this person actually understand how this works, even if they expressed it imperfectly?"
- 0.9-1.0 = Clearly understands the concept — can explain the mechanism, give examples, show how things connect. Imprecise wording is OK if the reasoning is sound.
- 0.7-0.8 = Good grasp of the concept with minor gaps in depth or nuance
- 0.5-0.6 = Understands the basics but misses important aspects of why/how
- 0.3-0.4 = Vague or superficial — seems to have heard of it but can't explain it
- 0.0-0.2 = No demonstrated understanding

KEY RULES:
- These two scores SHOULD often differ. A student who understands the concept but states one wrong fact should get a HIGHER understanding score than correctness score.
- A student who memorized the right answer without understanding should get a HIGHER correctness score than understanding score.
- For oral/spoken answers: do NOT penalize informal language, repetition, filler words, or conversational tone. Students speak differently than they write. Focus on the substance.
- For simple factual questions: a correct concise answer proves understanding (give 0.9-1.0 for understanding).
- Be generous with understanding when the student demonstrates they grasp the core mechanism, even if their examples or terminology are slightly off.

Respond with ONLY two numbers separated by a comma, like: 0.7,0.85
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
    const transcription = await transcribeAudio(audioData, question.text);
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

export async function aiQuestionChat(
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  materialContent: string,
  customApiKey?: string | null
): Promise<{ reply: string; questions?: Array<{ text: string; type: string; options?: string[]; correctAnswer?: string }> }> {
  try {
    const client = customApiKey
      ? new OpenAI({ apiKey: customApiKey })
      : openai;

    const materialSnippet = materialContent.substring(0, 8000);

    const systemPrompt = `You are a helpful exam-creation assistant for university professors. Your job is to help the professor create the perfect set of exam questions from their class materials.

AVAILABLE COURSE MATERIALS:
${materialSnippet}

YOUR WORKFLOW:
1. The professor will give you a rough idea of what they want. 
2. Ask ONE concise clarifying question at a time to understand their needs. Key things to clarify (if the professor hasn't specified them):
   - How many questions they want
   - What question type: "short" (written text answer), "mcq" (multiple choice), or "audio" (oral/spoken answer) — or a mix
   - What topic or chapter to focus on
   - Difficulty level
   - Any other style preferences
3. After each answer, if you still need more info, ask the next question. Keep it conversational and brief.
4. Once you have enough information (usually 2-4 clarifying questions), generate the questions.

WHEN GENERATING QUESTIONS:
- When you're ready to generate, output EXACTLY this format — your conversational message first, then a JSON block:
  
  Your message here (e.g. "Great! Here are your questions:")
  
  ===QUESTIONS_JSON===
  [
    {"text": "...", "type": "short|mcq|audio", "options": ["a","b","c","d"], "correctAnswer": "..."},
    ...
  ]
  ===END_QUESTIONS_JSON===

- For "mcq" questions, always include exactly 4 options
- For "short" and "audio" questions, omit the "options" field
- Always include a "correctAnswer"

IMPORTANT RULES:
- Ask only ONE question at a time. Be concise.
- Don't overwhelm the professor — keep your messages short and friendly.
- If the professor's very first message already specifies everything clearly (number, type, topic, difficulty), you may skip clarifying and generate immediately.
- Never generate questions without the ===QUESTIONS_JSON=== markers.`;

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 3000,
      temperature: 0.7,
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || "";

    const jsonMatch = responseText.match(/===QUESTIONS_JSON===\s*([\s\S]*?)\s*===END_QUESTIONS_JSON===/);
    if (jsonMatch) {
      const replyText = responseText.replace(/===QUESTIONS_JSON===[\s\S]*===END_QUESTIONS_JSON===/, "").trim();
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const questions = parsed.map((q: any) => ({
          text: q.text || "",
          type: ["short", "mcq", "audio"].includes(q.type) ? q.type : "short",
          options: q.type === "mcq" && Array.isArray(q.options) ? q.options : undefined,
          correctAnswer: q.correctAnswer || undefined,
        }));
        return { reply: replyText || "Here are your questions!", questions };
      } catch {
        return { reply: responseText };
      }
    }

    return { reply: responseText };
  } catch (error) {
    console.error("[AI-CHAT] Question chat failed:", error);
    throw new Error("Failed to communicate with AI assistant");
  }
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

export async function analyzeProctoringPatterns(
  examTitle: string,
  questions: Array<{ text: string; correctAnswer?: string }>,
  responses: Array<{ questionId: string; response: string }>,
  scores: Record<string, number>,
  proctoringFlags: Array<{ type: string; timestamp: string; durationAway?: number; aiVerdict?: string }>,
  tabSwitchCount: number,
  customApiKey?: string | null
): Promise<string> {
  try {
    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;

    const flagSummary = proctoringFlags.map((f, i) => {
      const parts = [`Switch #${i + 1} at ${f.timestamp}`];
      if (f.durationAway) parts.push(`(away ${f.durationAway}s)`);
      if (f.aiVerdict) parts.push(`- ${f.aiVerdict}`);
      return parts.join(" ");
    }).join("\n");

    const qaSummary = questions.map((q, i) => {
      const resp = responses.find(r => r.questionId === (q as any).id);
      const score = scores[(q as any).id] ?? "N/A";
      const scoreStr = typeof score === "number" ? (score * 100).toFixed(0) + "%" : String(score);
      return "Q" + (i + 1) + ': "' + q.text + '"\nAnswer: "' + (resp?.response || "(no answer)") + '"\nScore: ' + scoreStr;
    }).join("\n\n");

    const totalAway = proctoringFlags.reduce((sum, f) => sum + (f.durationAway || 0), 0);

    const prompt = `You are an exam integrity analyst. Review this student's exam submission for signs of cheating.

EXAM: "${examTitle}"
TAB SWITCHES: ${tabSwitchCount} total (${Math.round(totalAway)}s total time away from exam)

TAB SWITCH DETAILS:
${flagSummary || "No detailed events recorded"}

QUESTIONS AND ANSWERS:
${qaSummary}

Analyze the patterns:
1. Do tab switches correlate with difficult questions or sudden answer improvements?
2. Is the time away consistent with looking up answers?
3. Are answers suspiciously detailed or accurate given the student left the exam?

Provide a SHORT assessment (3-4 sentences max) with one of these verdicts:
- "LOW RISK" - Tab switches appear incidental (e.g., brief, during easy questions)
- "MODERATE RISK" - Some suspicious patterns but inconclusive
- "HIGH RISK" - Strong indicators of potential cheating (e.g., long absences before correct answers to hard questions)

Format: Start with the verdict in brackets like [HIGH RISK], then explain briefly.`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.1,
    });
    return completion.choices[0]?.message?.content?.trim() || "Analysis unavailable";
  } catch (error) {
    console.error("[PROCTORING] AI pattern analysis failed:", error);
    return "AI analysis unavailable - could not connect to the AI service.";
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
  updateClassRoster(id: string, roster: string[]): Promise<Class | undefined>;
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

  async updateClassRoster(id: string, roster: string[]): Promise<Class | undefined> {
    const [updated] = await db.update(classes).set({ roster }).where(eq(classes.id, id)).returning();
    return updated;
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
