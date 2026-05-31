import OpenAI, { toFile } from "openai";
import { eq, and, sql } from "drizzle-orm";
import { db } from "./db";
import { pool } from "./db";
import {
  users,
  universities,
  classes,
  enrollments,
  exams,
  submissions,
  classMaterials,
  userEvents,
  supportRequests,
  chatMessages,
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
  type VoxScoreProfile,
  type VoxDimension,
  type VoxDimensionScore,
  type VoxBand,
  voxDimensions,
  VOX_DIMENSION_WEIGHTS,
  VOX_PASS_THRESHOLD,
  type ClassMaterial,
  type InsertClassMaterial,
  type StudentPerformanceRadar,
  type QuestionTypeBreakdown,
  type PerformanceTrend,
  type GradingMethodDistribution,
  type SubmissionTimelineEntry,
  type UserEvent,
  type SupportRequest,
  type ChatMessage,
  type VoxConfidenceLevel,
  practiceSessions,
  type PracticeSession,
  type InsertPracticeSession,
  type PracticeQuestion,
  type PracticeCoverageStatus,
  type PracticeSessionMode,
  type PracticeCoachStyle,
  type PracticeCognitiveLevel,
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
  voxScoreProfile?: VoxScoreProfile;
}

// Clamp a number into the 1–5 band range as an integer.
function clampBand(n: number): VoxBand {
  const r = Math.round(n);
  return Math.max(1, Math.min(5, r)) as VoxBand;
}

// Build a uniform VoxScoreProfile from a single 0–1 score (used on fallback paths
// where no structured AI evaluation is available).
function fallbackProfile(score: number, language = "unknown"): VoxScoreProfile {
  const band = clampBand(score * 4 + 1);
  const dimensions: VoxDimensionScore[] = voxDimensions.map((dimension) => ({
    dimension,
    band,
    weightedScore: (band / 5) * VOX_DIMENSION_WEIGHTS[dimension] * 100,
    evidence: "Automatically estimated — structured AI evaluation unavailable.",
    conceptsPresent: [],
    conceptsMissing: [],
    conceptsIncorrect: [],
  }));
  const totalScore = dimensions.reduce((a, d) => a + d.weightedScore, 0);
  return {
    dimensions,
    totalScore,
    passFail: totalScore >= VOX_PASS_THRESHOLD ? "pass" : "fail",
    confidenceLevel: "low",
    asrQualityFlag: "needs_human_review",
    languageDetected: language,
  };
}

// Combine multiple per-question VoxScoreProfiles into one submission-level profile
// by averaging each dimension's band and weighted score.
function aggregateProfiles(profiles: VoxScoreProfile[]): VoxScoreProfile | undefined {
  if (profiles.length === 0) return undefined;
  if (profiles.length === 1) return profiles[0];

  const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const asrRank: Record<string, number> = { ok: 3, low_confidence: 2, needs_human_review: 1 };

  const dimensions: VoxDimensionScore[] = voxDimensions.map((dimension) => {
    const perDim = profiles
      .map((p) => p.dimensions.find((d) => d.dimension === dimension))
      .filter((d): d is VoxDimensionScore => !!d);
    const avgBand = clampBand(perDim.reduce((a, d) => a + d.band, 0) / perDim.length);
    const avgWeighted = perDim.reduce((a, d) => a + d.weightedScore, 0) / perDim.length;
    const dedupe = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
    return {
      dimension,
      band: avgBand,
      weightedScore: avgWeighted,
      evidence: perDim.map((d) => d.evidence).filter(Boolean).join(" "),
      conceptsPresent: dedupe(perDim.flatMap((d) => d.conceptsPresent || [])),
      conceptsMissing: dedupe(perDim.flatMap((d) => d.conceptsMissing || [])),
      conceptsIncorrect: dedupe(perDim.flatMap((d) => d.conceptsIncorrect || [])),
    };
  });
  const totalScore = dimensions.reduce((a, d) => a + d.weightedScore, 0);

  const worstConfidence = profiles.reduce(
    (acc, p) => (confidenceRank[p.confidenceLevel] < confidenceRank[acc] ? p.confidenceLevel : acc),
    profiles[0].confidenceLevel
  );
  const worstAsr = profiles.reduce(
    (acc, p) => (asrRank[p.asrQualityFlag] < asrRank[acc] ? p.asrQualityFlag : acc),
    profiles[0].asrQualityFlag
  );
  const languages = Array.from(new Set(profiles.map((p) => p.languageDetected).filter(Boolean)));

  return {
    dimensions,
    totalScore,
    passFail: totalScore >= VOX_PASS_THRESHOLD ? "pass" : "fail",
    confidenceLevel: worstConfidence,
    asrQualityFlag: worstAsr,
    languageDetected: languages.length === 1 ? languages[0] : languages.join(", ") || "unknown",
  };
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

    const prompt = `You are a fair, experienced university professor grading a student's oral exam answer using the VoxScore framework. Evaluate the answer across SEVEN independent dimensions. A student can score high on some dimensions and low on others — the dimension scores should reflect genuine differences.
${materialSection}
Question: ${question.text}

Expected Answer: ${question.correctAnswer || "No specific expected answer provided"}

Student's Answer: ${response}

Score the academic meaning of the answer regardless of whether it is in English, Arabic, or a mix of both. Never penalize language choice, accent, or code-switching unless meaning is materially blocked.

For each dimension, assign a BAND from 1 to 5:
- 1 = Inadequate
- 2 = Limited
- 3 = Developing
- 4 = Proficient
- 5 = Exemplary

The seven dimensions and their weights:
- D1 Subject Knowledge and Content Accuracy (weight 25%) — factual correctness, depth, disciplinary terminology, conceptual relationships, absence of misconceptions
- D2 Reasoning and Critical Thinking (weight 20%) — analysis, synthesis, causal explanation, evaluation, assumptions, limitations, intellectual independence
- D3 Evidence and Justification (weight 15%) — use of examples, cases, data, or discipline-specific evidence to justify claims
- D4 Responsiveness and Defense (weight 15%) — directly answering the question, adapting under probing, defending or revising claims, epistemic honesty
- D5 Organization and Coherence (weight 10%) — logical sequencing, transitions, structure, topic control
- D6 Communication Clarity (weight 10%) — comprehensibility, lexical precision, clear central message; score meaning not accent or language choice
- D7 Professionalism and Composure (weight 5%) — academic register, respectful engagement, composure

Guidelines:
- For oral/spoken answers, do NOT penalize informal language, repetition, filler words, or conversational tone. Focus on substance.
- For each dimension provide: a band (1-5), a short evidence string citing the answer, and concept lists (conceptsPresent, conceptsMissing, conceptsIncorrect) grounded in the question and any materials. Concept lists may be empty arrays.

Respond with ONLY a JSON object in EXACTLY this shape:
{
  "dimensions": [
    {"dimension":"D1","band":4,"evidence":"...","conceptsPresent":["..."],"conceptsMissing":["..."],"conceptsIncorrect":["..."]},
    {"dimension":"D2","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D3", ...},
    {"dimension":"D4", ...},
    {"dimension":"D5", ...},
    {"dimension":"D6", ...},
    {"dimension":"D7", ...}
  ],
  "confidenceLevel": "high" | "medium" | "low",
  "languageDetected": "english" | "arabic" | "mixed" | "other"
}
Include all seven dimensions D1 through D7 exactly once.`;

    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);

    if (!parsed || !Array.isArray(parsed.dimensions)) {
      const fb = fallbackScore(question, response);
      return { score: fb, understandingScore: fb, method: "fallback", voxScoreProfile: fallbackProfile(fb) };
    }

    const dimensions: VoxDimensionScore[] = voxDimensions.map((dimension) => {
      const d = parsed.dimensions.find((x: any) => x?.dimension === dimension);
      const band = clampBand(typeof d?.band === "number" ? d.band : 3);
      const toStrArr = (v: any): string[] =>
        Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim().length > 0) : [];
      return {
        dimension,
        band,
        weightedScore: (band / 5) * VOX_DIMENSION_WEIGHTS[dimension] * 100,
        evidence: typeof d?.evidence === "string" ? d.evidence : "",
        conceptsPresent: toStrArr(d?.conceptsPresent),
        conceptsMissing: toStrArr(d?.conceptsMissing),
        conceptsIncorrect: toStrArr(d?.conceptsIncorrect),
      };
    });

    const totalScore = dimensions.reduce((a, d) => a + d.weightedScore, 0);
    const confidenceLevel =
      parsed.confidenceLevel === "high" || parsed.confidenceLevel === "medium" || parsed.confidenceLevel === "low"
        ? parsed.confidenceLevel
        : "medium";
    const languageDetected = typeof parsed.languageDetected === "string" ? parsed.languageDetected : "unknown";

    const voxScoreProfile: VoxScoreProfile = {
      dimensions,
      totalScore,
      passFail: totalScore >= VOX_PASS_THRESHOLD ? "pass" : "fail",
      confidenceLevel,
      asrQualityFlag: "ok",
      languageDetected,
    };

    // Legacy flat scores derived from the profile so existing aggregates keep working.
    // Correctness maps to D1 (content accuracy); understanding maps to D2 (reasoning).
    const d1 = dimensions.find((d) => d.dimension === "D1")!;
    const d2 = dimensions.find((d) => d.dimension === "D2")!;
    const score = d1.band / 5;
    const understandingScore = d2.band / 5;

    return { score, understandingScore, method: "ai", voxScoreProfile };
  } catch (error) {
    console.error("[AI-GRADING] AI grading failed, using fallback:", error);
    const fb = fallbackScore(question, response);
    return { score: fb, understandingScore: fb, method: "fallback", voxScoreProfile: fallbackProfile(fb) };
  }
}

export async function evaluateQuickVoxAnswer(
  question: string,
  transcript: string,
  customApiKey?: string | null
): Promise<{ insight: string; followUp: string }> {
  const systemPrompt = `You are a warm, thoughtful conversation partner. A person just answered a quick voice question (a "QuickVox"). Your job is to respond with ONE genuine insight about what they said and ONE follow-up question that invites them to reflect a little more deeply.

Always respond in the SAME LANGUAGE as the person's answer.

Return ONLY a JSON object in exactly this shape:
{"insight": "...", "followUp": "..."}

- "insight": 1–2 short sentences. Warm, specific, and human. Reflect back something meaningful you noticed in their answer — a strength, a tension, a non-obvious pattern. Avoid generic praise, judgment, or advice.
- "followUp": ONE open-ended, curious question that builds naturally on what they said. Not a quiz, not a yes/no.

Do not include anything outside the JSON object.`;

  const userMessage = `Question: ${question}\n\nTheir answer: ${transcript}`;

  try {
    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 250,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const insight = typeof parsed.insight === "string" ? parsed.insight.trim() : "";
    const followUp = typeof parsed.followUp === "string" ? parsed.followUp.trim() : "";
    return { insight, followUp };
  } catch (error) {
    console.error("[QUICKVOX] evaluateQuickVoxAnswer failed:", error);
    return { insight: "", followUp: "" };
  }
}

// ===========================================================================
// VoxPractice AI layer — private, student-led oral self-training.
// Completely separate from evaluateWithAI and the professor grading pipeline.
// Every VoxPractice call uses gpt-4o (not gpt-4o-mini).
// ===========================================================================

const PRACTICE_MODEL = "gpt-4o";

// Bilingual scoring clause required on every VoxPractice grading prompt.
const PRACTICE_BILINGUAL_CLAUSE =
  "Score the academic meaning of the answer regardless of whether it is in English, Arabic, or a mix of both. Never penalize language choice, accent, or code-switching unless meaning is materially blocked.";

// The only follow-up probes the AI is permitted to use. These open up thinking
// without leading toward, completing, or confirming the answer.
const PRACTICE_APPROVED_PROBES = [
  "Can you give me an example?",
  "What would happen if the opposite were true?",
  "How does that connect to what you said earlier?",
  "Why does that relationship hold?",
  "What evidence supports your answer?",
  "What assumption are you making here?",
] as const;

function practiceClient(customApiKey?: string | null): OpenAI {
  return customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;
}

// Build a VoxScoreProfile from an AI dimensions array. Mirrors the parsing in
// evaluateWithAI but lives separately so the existing grading path is untouched.
function practiceProfileFromDimensions(parsed: any, fallbackLanguage = "unknown"): VoxScoreProfile {
  const dimensions: VoxDimensionScore[] = voxDimensions.map((dimension) => {
    const d = Array.isArray(parsed?.dimensions)
      ? parsed.dimensions.find((x: any) => x?.dimension === dimension)
      : undefined;
    const band = clampBand(typeof d?.band === "number" ? d.band : 3);
    const toStrArr = (v: any): string[] =>
      Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim().length > 0) : [];
    return {
      dimension,
      band,
      weightedScore: (band / 5) * VOX_DIMENSION_WEIGHTS[dimension] * 100,
      evidence: typeof d?.evidence === "string" ? d.evidence : "",
      conceptsPresent: toStrArr(d?.conceptsPresent),
      conceptsMissing: toStrArr(d?.conceptsMissing),
      conceptsIncorrect: toStrArr(d?.conceptsIncorrect),
    };
  });
  const totalScore = dimensions.reduce((a, d) => a + d.weightedScore, 0);
  const confidenceLevel: VoxConfidenceLevel =
    parsed?.confidenceLevel === "high" || parsed?.confidenceLevel === "medium" || parsed?.confidenceLevel === "low"
      ? parsed.confidenceLevel
      : "medium";
  const languageDetected =
    typeof parsed?.languageDetected === "string" && parsed.languageDetected.trim().length > 0
      ? parsed.languageDetected
      : fallbackLanguage;
  return {
    dimensions,
    totalScore,
    passFail: totalScore >= VOX_PASS_THRESHOLD ? "pass" : "fail",
    confidenceLevel,
    asrQualityFlag: "ok",
    languageDetected,
  };
}

export interface PracticeMaterialSummary {
  summary: string;
  concepts: string[];
  topics: string[];
  sampleQuestions: string[];
  detectedLanguage: string;
}

// Step 1 — analyze the student's chosen material into a concept/topic/question summary.
export async function analyzePracticeMaterial(
  materialContent: string,
  customApiKey?: string | null
): Promise<PracticeMaterialSummary> {
  const empty: PracticeMaterialSummary = {
    summary: "",
    concepts: [],
    topics: [],
    sampleQuestions: [],
    detectedLanguage: "unknown",
  };
  const trimmed = (materialContent || "").trim();
  if (!trimmed) return empty;

  const prompt = `You are helping a university student prepare for an oral exam. Analyze the study material below and extract what matters for oral practice.

${PRACTICE_BILINGUAL_CLAUSE}

Study material:
${trimmed.substring(0, 12000)}

Return ONLY a JSON object in exactly this shape:
{
  "summary": "2-3 sentence plain-language overview of what this material covers",
  "concepts": ["key concept 1", "key concept 2", "..."],
  "topics": ["broader topic 1", "topic 2"],
  "sampleQuestions": ["an oral question grounded in the material", "..."],
  "detectedLanguage": "english" | "arabic" | "mixed" | "other"
}

Rules:
- Extract 5-10 concepts and 2-5 topics, all strictly grounded in the material — never invent content not present.
- Provide 3-5 sample oral questions that could be asked about this material.
- Keep everything concise.`;

  try {
    const client = practiceClient(customApiKey);
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 900,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const toStrArr = (v: any): string[] =>
      Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim().length > 0).map((s) => s.trim()) : [];
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      concepts: toStrArr(parsed.concepts),
      topics: toStrArr(parsed.topics),
      sampleQuestions: toStrArr(parsed.sampleQuestions),
      detectedLanguage: typeof parsed.detectedLanguage === "string" ? parsed.detectedLanguage : "unknown",
    };
  } catch (error) {
    console.error("[VOXPRACTICE] analyzePracticeMaterial failed:", error);
    return empty;
  }
}

// Number of questions to generate per session mode.
const PRACTICE_MODE_QUESTION_COUNT: Record<PracticeSessionMode, number> = {
  warmup: 3,
  readiness_sprint: 5,
  weak_spot: 4,
  mock_oral: 6,
};

// Step 2 — generate a material-grounded question set spanning cognitive levels.
export async function generatePracticeQuestions(
  materialContent: string,
  options: { sessionMode: PracticeSessionMode; coachStyle?: PracticeCoachStyle; count?: number; focusConcepts?: string[] },
  customApiKey?: string | null
): Promise<PracticeQuestion[]> {
  const trimmed = (materialContent || "").trim();
  if (!trimmed) return [];

  const count = Math.max(1, Math.min(options.count ?? PRACTICE_MODE_QUESTION_COUNT[options.sessionMode] ?? 4, 10));
  const focusSection =
    options.focusConcepts && options.focusConcepts.length > 0
      ? `\nFocus especially on these concepts the student wants to strengthen: ${options.focusConcepts.join(", ")}.\n`
      : "";

  const prompt = `You are an oral-exam coach generating practice questions for a university student. Base every question STRICTLY on the study material below — never ask about anything not present in it.

${PRACTICE_BILINGUAL_CLAUSE}
${focusSection}
Study material:
${trimmed.substring(0, 12000)}

Generate exactly ${count} oral practice questions that, taken together, span these cognitive levels: recall, understanding, application, comparison, reasoning, and defense. Each question targets ONE level and ONE concept drawn from the material.

Return ONLY a JSON object in exactly this shape:
{
  "questions": [
    {"text": "the oral question", "cognitiveLevel": "recall" | "understanding" | "application" | "comparison" | "reasoning" | "defense", "concept": "the material concept this targets"}
  ]
}

Rules:
- Every concept must be traceable to the material above.
- Vary the cognitive levels across the set; do not make them all recall.
- Questions must be answerable by speaking aloud in 1-2 minutes.`;

  try {
    const client = practiceClient(customApiKey);
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1500,
      temperature: 0.5,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const validLevels = new Set<PracticeCognitiveLevel>([
      "recall",
      "understanding",
      "application",
      "comparison",
      "reasoning",
      "defense",
    ]);
    return list
      .filter((q: any) => q && typeof q.text === "string" && q.text.trim().length > 0)
      .slice(0, count)
      .map((q: any) => ({
        id: crypto.randomUUID(),
        text: q.text.trim(),
        cognitiveLevel: validLevels.has(q.cognitiveLevel) ? q.cognitiveLevel : "understanding",
        concept: typeof q.concept === "string" && q.concept.trim().length > 0 ? q.concept.trim() : undefined,
      }));
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeQuestions failed:", error);
    return [];
  }
}

// Step 3 — produce a single follow-up probe, chosen ONLY from the approved list,
// that never reveals or completes the answer.
export async function generatePracticeProbe(
  questionText: string,
  transcript: string,
  options?: { coachStyle?: PracticeCoachStyle; materialContent?: string | null },
  customApiKey?: string | null
): Promise<{ probe: string }> {
  const defaultProbe = PRACTICE_APPROVED_PROBES[0];
  if (!transcript || transcript.trim().length === 0) return { probe: defaultProbe };

  const probeList = PRACTICE_APPROVED_PROBES.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const prompt = `You are an oral-exam coach. The student just answered a practice question by voice. Choose the SINGLE best follow-up probe to deepen their thinking.

${PRACTICE_BILINGUAL_CLAUSE}

Question: ${questionText}
Student's answer: ${transcript}

You may ONLY use one of these approved probes — never invent a new one, never plant or complete the answer, never confirm whether they were right or wrong:
${probeList}

Return ONLY a JSON object in exactly this shape:
{"probeIndex": <the number of the chosen probe, 1-${PRACTICE_APPROVED_PROBES.length}>}`;

  try {
    const client = practiceClient(customApiKey);
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 60,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const idx = Number(parsed?.probeIndex);
    if (Number.isFinite(idx) && idx >= 1 && idx <= PRACTICE_APPROVED_PROBES.length) {
      return { probe: PRACTICE_APPROVED_PROBES[idx - 1] };
    }
    return { probe: defaultProbe };
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeProbe failed:", error);
    return { probe: defaultProbe };
  }
}

// Step 4 — per-answer micro-feedback plus a 7-dimension practice VoxScore.
export async function generatePracticeMicroFeedback(
  questionText: string,
  transcript: string,
  options?: { coachStyle?: PracticeCoachStyle; materialContent?: string | null; concept?: string | null },
  customApiKey?: string | null
): Promise<{ microFeedback: string; voxScoreProfile: VoxScoreProfile }> {
  if (!transcript || transcript.trim().length === 0) {
    return { microFeedback: "", voxScoreProfile: fallbackProfile(0) };
  }

  const coachStyle = options?.coachStyle ?? "normal";
  const styleNote =
    coachStyle === "gentle"
      ? "Be warm and encouraging; lead with what worked."
      : coachStyle === "strict"
        ? "Be direct and rigorous; hold the student to a high bar."
        : "Be balanced — honest but supportive.";
  const materialSection = options?.materialContent
    ? `\nStudy material (use to judge accuracy and grounding):\n${options.materialContent.substring(0, 8000)}\n`
    : "";

  const prompt = `You are an oral-exam coach giving a university student private practice feedback on one spoken answer. Score the answer on the VoxScore seven-dimension framework and write one short coaching note.

${PRACTICE_BILINGUAL_CLAUSE}
${materialSection}
Question: ${questionText}
${options?.concept ? `Concept being practiced: ${options.concept}\n` : ""}Student's spoken answer: ${transcript}

Coaching tone: ${styleNote}

For each dimension assign a BAND from 1 (Inadequate) to 5 (Exemplary):
- D1 Subject Knowledge and Content Accuracy (25%)
- D2 Reasoning and Critical Thinking (20%)
- D3 Evidence and Justification (15%)
- D4 Responsiveness and Defense (15%)
- D5 Organization and Coherence (10%)
- D6 Communication Clarity (10%)
- D7 Professionalism and Composure (5%)

Do NOT penalize informal language, filler words, or conversational tone — focus on substance. Concept lists may be empty arrays.

Return ONLY a JSON object in exactly this shape:
{
  "microFeedback": "2-3 sentence coaching note: one strength, one concrete thing to improve",
  "dimensions": [
    {"dimension":"D1","band":4,"evidence":"...","conceptsPresent":["..."],"conceptsMissing":["..."],"conceptsIncorrect":["..."]},
    {"dimension":"D2", ...}, {"dimension":"D3", ...}, {"dimension":"D4", ...},
    {"dimension":"D5", ...}, {"dimension":"D6", ...}, {"dimension":"D7", ...}
  ],
  "confidenceLevel": "high" | "medium" | "low",
  "languageDetected": "english" | "arabic" | "mixed" | "other"
}
Include all seven dimensions D1 through D7 exactly once.`;

  try {
    const client = practiceClient(customApiKey);
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1400,
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const microFeedback = typeof parsed?.microFeedback === "string" ? parsed.microFeedback.trim() : "";
    const voxScoreProfile = practiceProfileFromDimensions(parsed);
    return { microFeedback, voxScoreProfile };
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeMicroFeedback failed:", error);
    return { microFeedback: "", voxScoreProfile: fallbackProfile(0) };
  }
}

export interface PracticeReadinessReport {
  overallReadinessScore: number;
  overallVoxScoreProfile: VoxScoreProfile | null;
  conceptCoverageMap: Record<string, PracticeCoverageStatus>;
  completedQuestionCount: number;
  languageUsed: string;
}

// Step 5 — finalize a session into a readiness report by aggregating the answered
// questions' profiles. Pure computation (no extra AI call) over captured answers.
export function buildPracticeReadinessReport(questions: PracticeQuestion[]): PracticeReadinessReport {
  const answered = (questions || []).filter((q) => q.voxScoreProfile);
  const profiles = answered.map((q) => q.voxScoreProfile!).filter(Boolean);
  const overallVoxScoreProfile = aggregateProfiles(profiles) ?? null;
  const overallReadinessScore = overallVoxScoreProfile ? overallVoxScoreProfile.totalScore : 0;

  // Concept coverage: rank each concept by the bands of the questions that targeted it.
  const conceptBands: Record<string, number[]> = {};
  for (const q of answered) {
    const concept = (q.concept || "").trim();
    if (!concept) continue;
    const profile = q.voxScoreProfile!;
    // Use D1 (subject knowledge) band as the coverage signal for the concept.
    const d1 = profile.dimensions.find((d) => d.dimension === "D1");
    if (d1) {
      (conceptBands[concept] = conceptBands[concept] || []).push(d1.band);
    }
  }
  const conceptCoverageMap: Record<string, PracticeCoverageStatus> = {};
  for (const [concept, bands] of Object.entries(conceptBands)) {
    const avg = bands.reduce((a, b) => a + b, 0) / bands.length;
    conceptCoverageMap[concept] =
      avg >= 4 ? "strong" : avg >= 3 ? "developing" : "weak";
  }

  const languages = Array.from(new Set(profiles.map((p) => p.languageDetected).filter(Boolean)));
  const languageUsed = languages.length === 1 ? languages[0] : languages.join(", ") || "unknown";

  return {
    overallReadinessScore,
    overallVoxScoreProfile,
    conceptCoverageMap,
    completedQuestionCount: answered.length,
    languageUsed,
  };
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

export async function generateExamAccessCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    const [existing] = await db.select().from(exams).where(eq(exams.accessCode, code));
    if (!existing) return code;
  }
  return String(Math.floor(10000 + Math.random() * 90000));
}

export async function generateClassJoinCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 10; i++) {
    let code = "";
    for (let j = 0; j < 6; j++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const [existing] = await db.select().from(classes).where(eq(classes.joinCode, code));
    if (!existing) return code;
  }
  let code = "";
  for (let j = 0; j < 6; j++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
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
  updateSubmissionDecision(submissionId: string, data: {
    professorDecision: string;
    professorOverrideReason?: string | null;
    professorHolisticScore?: number | null;
    professorReviewDurationMinutes?: number | null;
    gradingGap: number;
    arabicFlag: boolean;
  }): Promise<ExamSubmission | undefined>;

  // Practice sessions (VoxPractice — private to the student)
  createPracticeSession(studentId: string, data: InsertPracticeSession): Promise<PracticeSession>;
  getPracticeSession(id: string): Promise<PracticeSession | undefined>;
  getPracticeSessionsByStudent(studentId: string): Promise<PracticeSession[]>;
  updatePracticeSession(id: string, updates: Partial<PracticeSession>): Promise<PracticeSession | undefined>;

  // Support
  createSupportRequest(data: { userId: string; userName?: string; userRole?: string; message?: string; pageUrl?: string }): Promise<SupportRequest>;
  getSupportRequests(): Promise<SupportRequest[]>;
  updateSupportRequestStatus(id: string, status: string): Promise<SupportRequest | undefined>;
  getSupportRequest(id: string): Promise<SupportRequest | undefined>;
  getChatMessages(supportRequestId: string): Promise<ChatMessage[]>;
  createChatMessage(data: { supportRequestId: string; senderId: string; senderRole: string; message: string }): Promise<ChatMessage>;

  // Exam access code
  getExamByAccessCode(code: string): Promise<Exam | undefined>;
  regenerateExamAccessCode(examId: string): Promise<Exam | undefined>;

  // Class join code
  getClassByJoinCode(code: string): Promise<Class | undefined>;
  regenerateClassJoinCode(classId: string): Promise<Class | undefined>;

  // Analytics
  getExamAnalytics(examId: string): Promise<{
    examId: string;
    totalStudents: number;
    avgCorrectness: number;
    avgUnderstanding: number;
    students: { studentId: string; name: string | null; avgCorrectness: number; avgUnderstanding: number }[];
  }>;
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
    const joinCode = await generateClassJoinCode();
    const [cls] = await db.insert(classes).values({ ...data, joinCode }).returning();
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

    let accessCode: string | null = null;
    let accessCodeExpiresAt: Date | null = null;
    const expiryMs = insertExam.mode === "quickvox"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 60 * 1000;

    if (insertExam.customAccessCode) {
      const [existing] = await db.select().from(exams).where(eq(exams.accessCode, insertExam.customAccessCode));
      if (existing) {
        throw new Error("Access code already in use");
      }
      accessCode = insertExam.customAccessCode;
      accessCodeExpiresAt = new Date(Date.now() + expiryMs);
    } else if (insertExam.autoGenerateCode !== false) {
      accessCode = await generateExamAccessCode();
      accessCodeExpiresAt = new Date(Date.now() + expiryMs);
    }

    const [exam] = await db.insert(exams).values({
      title: insertExam.title,
      professorId,
      classId: insertExam.classId || null,
      questions: questionsWithIds,
      startTime: insertExam.startTime || null,
      endTime: insertExam.endTime || null,
      assignedStudentIds: insertExam.assignedStudentIds || [],
      assignedStudentNames: insertExam.assignedStudentNames || [],
      accessCode,
      accessCodeExpiresAt,
      mode: insertExam.mode || "exam",
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

    if (exam.mode === "quickvox") {
      let quickvoxInsight = "";
      let quickvoxFollowUp = "";
      const response = responses[0];
      const question = response ? exam.questions.find((q) => q.id === response.questionId) : undefined;
      if (response && question) {
        let transcript = response.response || "";
        if (question.type === "audio" && response.audioData && response.audioData.length > 0) {
          const t = await transcribeAudio(response.audioData, question.text);
          if (t) {
            transcript = t;
            response.transcript = t;
          }
        }
        if (transcript && transcript.trim().length > 0) {
          const result = await evaluateQuickVoxAnswer(question.text, transcript, customApiKey);
          quickvoxInsight = result.insight;
          quickvoxFollowUp = result.followUp;
        }
      }

      const [submission] = await db.insert(submissions).values({
        examId,
        studentId,
        responses,
        scores: {},
        understandingScores: {},
        gradingMethods: {},
        totalScore: 0,
        totalUnderstandingScore: 0,
        feedback: null,
        quickvoxInsight,
        quickvoxFollowUp,
        isPreview: isPreview ? "true" : "false",
        submittedAt: new Date().toISOString(),
      }).returning();

      return submission;
    }

    const scores: Record<string, number> = {};
    const understandingScoresMap: Record<string, number> = {};
    const gradingMethodsMap: Record<string, GradingMethod> = {};
    const questionProfiles: VoxScoreProfile[] = [];

    for (const response of responses) {
      const question = exam.questions.find((q) => q.id === response.questionId);
      if (question) {
        const result = await evaluateResponse(question, response.response, response.audioData, materialContext || undefined, customApiKey);
        scores[response.questionId] = result.score;
        understandingScoresMap[response.questionId] = result.understandingScore;
        gradingMethodsMap[response.questionId] = result.method;
        if (result.voxScoreProfile) {
          questionProfiles.push(result.voxScoreProfile);
        }
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

    // Submission-level VoxScore profile (0–100). The legacy totalScore column stays
    // on its 0–1 scale for backwards compatibility, so when a profile exists we set it
    // from voxScoreProfile.totalScore / 100.
    const voxScoreProfile = aggregateProfiles(questionProfiles) ?? null;
    const legacyTotalScore = voxScoreProfile ? voxScoreProfile.totalScore / 100 : totalScore;

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
      totalScore: legacyTotalScore,
      totalUnderstandingScore,
      feedback,
      voxScoreProfile,
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

  async updateSubmissionDecision(submissionId: string, data: {
    professorDecision: string;
    professorOverrideReason?: string | null;
    professorHolisticScore?: number | null;
    professorReviewDurationMinutes?: number | null;
    gradingGap: number;
    arabicFlag: boolean;
  }): Promise<ExamSubmission | undefined> {
    const [updated] = await db.update(submissions).set({
      professorDecision: data.professorDecision,
      professorOverrideReason: data.professorOverrideReason ?? null,
      professorHolisticScore: data.professorHolisticScore ?? null,
      professorReviewDurationMinutes: data.professorReviewDurationMinutes ?? null,
      professorReviewTimestamp: new Date(),
      gradingGap: data.gradingGap,
      arabicFlag: data.arabicFlag,
    }).where(eq(submissions.id, submissionId)).returning();

    return updated || undefined;
  }

  // Practice session methods (VoxPractice — private to the student)
  async createPracticeSession(studentId: string, data: InsertPracticeSession): Promise<PracticeSession> {
    const [session] = await db.insert(practiceSessions).values({
      studentId,
      sourceType: data.sourceType,
      sourceSummary: data.sourceSummary ?? null,
      sessionMode: data.sessionMode,
      coachStyle: data.coachStyle ?? "normal",
      languageUsed: data.languageUsed ?? null,
      questions: [],
    }).returning();
    return session;
  }

  async getPracticeSession(id: string): Promise<PracticeSession | undefined> {
    const [session] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, id));
    return session || undefined;
  }

  async getPracticeSessionsByStudent(studentId: string): Promise<PracticeSession[]> {
    return db.select().from(practiceSessions).where(eq(practiceSessions.studentId, studentId));
  }

  async updatePracticeSession(id: string, updates: Partial<PracticeSession>): Promise<PracticeSession | undefined> {
    const updateData: any = {};
    if (updates.sourceSummary !== undefined) updateData.sourceSummary = updates.sourceSummary;
    if (updates.questions !== undefined) updateData.questions = updates.questions;
    if (updates.overallReadinessScore !== undefined) updateData.overallReadinessScore = updates.overallReadinessScore;
    if (updates.overallVoxScoreProfile !== undefined) updateData.overallVoxScoreProfile = updates.overallVoxScoreProfile;
    if (updates.conceptCoverageMap !== undefined) updateData.conceptCoverageMap = updates.conceptCoverageMap;
    if (updates.languageUsed !== undefined) updateData.languageUsed = updates.languageUsed;
    if (updates.completedQuestionCount !== undefined) updateData.completedQuestionCount = updates.completedQuestionCount;
    if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt;
    if (Object.keys(updateData).length === 0) return this.getPracticeSession(id);
    const [session] = await db.update(practiceSessions).set(updateData).where(eq(practiceSessions.id, id)).returning();
    return session || undefined;
  }

  // Support request methods
  async createSupportRequest(data: { userId: string; userName?: string; userRole?: string; message?: string; pageUrl?: string }): Promise<SupportRequest> {
    const [req] = await db.insert(supportRequests).values(data).returning();
    return req;
  }

  async getSupportRequests(): Promise<SupportRequest[]> {
    return db.select().from(supportRequests).orderBy(sql`${supportRequests.createdAt} DESC`);
  }

  async updateSupportRequestStatus(id: string, status: string): Promise<SupportRequest | undefined> {
    const updateData: any = { status };
    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    }
    const [updated] = await db.update(supportRequests).set(updateData).where(eq(supportRequests.id, id)).returning();
    return updated || undefined;
  }

  async getSupportRequest(id: string): Promise<SupportRequest | undefined> {
    const [req] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
    return req || undefined;
  }

  async getChatMessages(supportRequestId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.supportRequestId, supportRequestId)).orderBy(chatMessages.createdAt);
  }

  async createChatMessage(data: { supportRequestId: string; senderId: string; senderRole: string; message: string }): Promise<ChatMessage> {
    const [msg] = await db.insert(chatMessages).values(data).returning();
    return msg;
  }

  // Exam access code methods
  async getExamByAccessCode(code: string): Promise<Exam | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.accessCode, code));
    return exam || undefined;
  }

  async regenerateExamAccessCode(examId: string): Promise<Exam | undefined> {
    const [existing] = await db.select().from(exams).where(eq(exams.id, examId));
    if (!existing) return undefined;
    const newCode = await generateExamAccessCode();
    const expiryMs = existing.mode === "quickvox"
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 60 * 1000;
    const newExpiry = new Date(Date.now() + expiryMs);
    const [updated] = await db.update(exams).set({
      accessCode: newCode,
      accessCodeExpiresAt: newExpiry,
    }).where(eq(exams.id, examId)).returning();
    return updated || undefined;
  }

  // Class join code methods
  async getClassByJoinCode(code: string): Promise<Class | undefined> {
    const [cls] = await db.select().from(classes).where(eq(classes.joinCode, code));
    return cls || undefined;
  }

  async regenerateClassJoinCode(classId: string): Promise<Class | undefined> {
    const newCode = await generateClassJoinCode();
    const [updated] = await db.update(classes).set({ joinCode: newCode }).where(eq(classes.id, classId)).returning();
    return updated || undefined;
  }

  async getExamAnalytics(examId: string) {
    const allSubs = await db.select().from(submissions).where(eq(submissions.examId, examId));
    const realSubs = allSubs.filter(s => s.isPreview !== "true" && !s.studentId.startsWith("demo-"));

    if (realSubs.length === 0) {
      return { examId, totalStudents: 0, avgCorrectness: 0, avgUnderstanding: 0, students: [] };
    }

    const studentMap = new Map<string, { scores: number[]; understandingScores: number[] }>();
    for (const sub of realSubs) {
      if (!studentMap.has(sub.studentId)) {
        studentMap.set(sub.studentId, { scores: [], understandingScores: [] });
      }
      const entry = studentMap.get(sub.studentId)!;
      entry.scores.push(sub.totalScore ?? 0);
      entry.understandingScores.push(sub.totalUnderstandingScore ?? 0);
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const allCorrectness = realSubs.map(s => s.totalScore ?? 0);
    const allUnderstanding = realSubs.map(s => s.totalUnderstandingScore ?? 0);

    const studentIds = Array.from(studentMap.keys());
    const userLookups = await Promise.all(studentIds.map(id => this.getUser(id)));
    const userNameMap = new Map<string, string | null>();
    for (let i = 0; i < studentIds.length; i++) {
      const u = userLookups[i];
      const name = u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || null : null;
      userNameMap.set(studentIds[i], name);
    }

    const students = studentIds.map(sid => {
      const data = studentMap.get(sid)!;
      return {
        studentId: sid,
        name: userNameMap.get(sid) || null,
        avgCorrectness: Math.round(avg(data.scores) * 100) / 100,
        avgUnderstanding: Math.round(avg(data.understandingScores) * 100) / 100,
      };
    });

    return {
      examId,
      totalStudents: studentIds.length,
      avgCorrectness: Math.round(avg(allCorrectness) * 100) / 100,
      avgUnderstanding: Math.round(avg(allUnderstanding) * 100) / 100,
      students,
    };
  }
}

export async function logUserEvent(userId: string, eventType: string, metadata?: Record<string, any>): Promise<void> {
  try {
    await db.insert(userEvents).values({
      userId,
      eventType,
      metadata: metadata || {},
    });
  } catch (error) {
    console.error("[EVENT-LOG] Failed to log event:", eventType, error);
  }
}

export async function computeStudentRadar(studentId: string, filterExamIds?: string[]): Promise<StudentPerformanceRadar> {
  const examFilter = filterExamIds && filterExamIds.length > 0
    ? `AND s.exam_id = ANY($2)`
    : "";
  const params: any[] = [studentId];
  if (filterExamIds && filterExamIds.length > 0) {
    params.push(filterExamIds);
  }

  const summaryQuery = `
    SELECT
      COUNT(*)::int AS total_submissions,
      COALESCE(AVG(s.total_score), 0) AS avg_correctness,
      COALESCE(AVG(s.total_understanding_score), 0) AS avg_understanding,
      COALESCE(AVG(s.tab_switch_count), 0) AS avg_tab_switches,
      COUNT(*) FILTER (WHERE s.is_suspicious = 'true')::int AS suspicious_count
    FROM submissions s
    WHERE s.student_id = $1
      AND s.is_preview = 'false'
      ${examFilter}
  `;

  const timelineQuery = `
    SELECT
      s.id AS submission_id,
      s.exam_id,
      e.title AS exam_title,
      s.total_score AS correctness_score,
      COALESCE(s.total_understanding_score, s.total_score) AS understanding_score,
      s.submitted_at,
      s.scores,
      s.understanding_scores,
      s.grading_methods,
      e.questions
    FROM submissions s
    JOIN exams e ON e.id = s.exam_id
    WHERE s.student_id = $1
      AND s.is_preview = 'false'
      ${examFilter}
    ORDER BY s.submitted_at ASC
  `;

  const [summaryResult, timelineResult] = await Promise.all([
    pool.query(summaryQuery, params),
    pool.query(timelineQuery, params),
  ]);

  const summary = summaryResult.rows[0] || {
    total_submissions: 0,
    avg_correctness: 0,
    avg_understanding: 0,
    avg_tab_switches: 0,
    suspicious_count: 0,
  };

  const totalSubmissions: number = summary.total_submissions;

  if (totalSubmissions === 0) {
    return {
      studentId,
      totalSubmissions: 0,
      avgCorrectness: 0,
      avgUnderstanding: 0,
      questionTypeBreakdown: [],
      strongestArea: null,
      weakestArea: null,
      trend: null,
      gradingMethodDistribution: { ai: 0, exact: 0, fallback: 0, manual: 0, total: 0, fallbackRatio: 0 },
      integrityRiskLevel: "low",
      suspiciousSubmissionCount: 0,
      avgTabSwitchCount: 0,
      submissionTimeline: [],
    };
  }

  const timeline: SubmissionTimelineEntry[] = timelineResult.rows.map((row: any) => ({
    submissionId: row.submission_id,
    examId: row.exam_id,
    examTitle: row.exam_title,
    correctnessScore: parseFloat(row.correctness_score) || 0,
    understandingScore: parseFloat(row.understanding_score) || 0,
    submittedAt: row.submitted_at,
  }));

  const typeAccum: Record<string, { totalC: number; totalU: number; count: number }> = {};
  const methodAccum: Record<string, number> = { ai: 0, exact: 0, fallback: 0, manual: 0 };
  let totalGradedQuestions = 0;

  for (const row of timelineResult.rows) {
    const questions: any[] = row.questions || [];
    const scores: Record<string, number> = row.scores || {};
    const uScores: Record<string, number> = row.understanding_scores || {};
    const methods: Record<string, string> = row.grading_methods || {};

    for (const q of questions) {
      const qId = q.id;
      const qType = q.type || "short";
      const cScore = scores[qId];
      const uScore = uScores[qId];

      if (cScore === undefined) continue;

      if (!typeAccum[qType]) {
        typeAccum[qType] = { totalC: 0, totalU: 0, count: 0 };
      }
      typeAccum[qType].totalC += cScore;
      typeAccum[qType].totalU += (uScore ?? cScore);
      typeAccum[qType].count += 1;

      const method = methods[qId] || "ai";
      if (method in methodAccum) {
        methodAccum[method] += 1;
      }
      totalGradedQuestions += 1;
    }
  }

  const questionTypeBreakdown: QuestionTypeBreakdown[] = Object.entries(typeAccum).map(
    ([type, acc]) => ({
      type: type as any,
      avgCorrectness: acc.count > 0 ? acc.totalC / acc.count : 0,
      avgUnderstanding: acc.count > 0 ? acc.totalU / acc.count : 0,
      count: acc.count,
    })
  );

  let strongestArea: QuestionTypeBreakdown | null = null;
  let weakestArea: QuestionTypeBreakdown | null = null;
  if (questionTypeBreakdown.length > 0) {
    const sorted = [...questionTypeBreakdown].sort(
      (a, b) => (a.avgCorrectness + a.avgUnderstanding) - (b.avgCorrectness + b.avgUnderstanding)
    );
    weakestArea = sorted[0];
    strongestArea = sorted[sorted.length - 1];
    if (sorted.length === 1) {
      strongestArea = sorted[0];
      weakestArea = sorted[0];
    }
  }

  let trend: PerformanceTrend | null = null;
  if (timeline.length >= 3) {
    const first3 = timeline.slice(0, 3);
    const last3 = timeline.slice(-3);
    const f3c = first3.reduce((s, e) => s + e.correctnessScore, 0) / 3;
    const f3u = first3.reduce((s, e) => s + e.understandingScore, 0) / 3;
    const l3c = last3.reduce((s, e) => s + e.correctnessScore, 0) / 3;
    const l3u = last3.reduce((s, e) => s + e.understandingScore, 0) / 3;
    const cChange = l3c - f3c;
    const uChange = l3u - f3u;
    const avgChange = (cChange + uChange) / 2;
    const direction: PerformanceTrend["direction"] =
      avgChange > 0.05 ? "improving" : avgChange < -0.05 ? "declining" : "stable";
    trend = {
      firstThreeAvgCorrectness: f3c,
      firstThreeAvgUnderstanding: f3u,
      lastThreeAvgCorrectness: l3c,
      lastThreeAvgUnderstanding: l3u,
      correctnessChange: cChange,
      understandingChange: uChange,
      direction,
    };
  }

  const gradingMethodDistribution: GradingMethodDistribution = {
    ai: methodAccum.ai,
    exact: methodAccum.exact,
    fallback: methodAccum.fallback,
    manual: methodAccum.manual,
    total: totalGradedQuestions,
    fallbackRatio: totalGradedQuestions > 0 ? methodAccum.fallback / totalGradedQuestions : 0,
  };

  const suspiciousCount: number = summary.suspicious_count;
  const suspiciousRatio = totalSubmissions > 0 ? suspiciousCount / totalSubmissions : 0;
  const integrityRiskLevel: StudentPerformanceRadar["integrityRiskLevel"] =
    suspiciousRatio >= 0.5 ? "high" : suspiciousRatio >= 0.2 ? "moderate" : "low";

  return {
    studentId,
    totalSubmissions,
    avgCorrectness: parseFloat(summary.avg_correctness) || 0,
    avgUnderstanding: parseFloat(summary.avg_understanding) || 0,
    questionTypeBreakdown,
    strongestArea,
    weakestArea,
    trend,
    gradingMethodDistribution,
    integrityRiskLevel,
    suspiciousSubmissionCount: suspiciousCount,
    avgTabSwitchCount: parseFloat(summary.avg_tab_switches) || 0,
    submissionTimeline: timeline,
  };
}

export const storage = new DatabaseStorage();
