import OpenAI, { toFile } from "openai";
import { createHash } from "crypto";
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
import {
  ensureCompatibleFormat,
  speechToText,
  type SpeechToTextLogprob,
  type SpeechToTextQuality,
} from "./replit_integrations/audio/client";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface AudioTranscriptionResult {
  text: string;
  logprobs?: SpeechToTextLogprob[];
}

interface AudioTranscriptionOptions {
  includeLogprobs?: boolean;
  quality?: SpeechToTextQuality;
}

const OFFICIAL_EXAM_TRANSCRIPTION_PROMPT =
  "Transcribe exactly what the student says. The answer may contain both Arabic and English academic terminology. Preserve the original language. Do not translate. Do not add words that are not spoken.";

const TRANSCRIPTION_LOGPROB_CACHE_TTL_MS = 5 * 60 * 1000;
const recentTranscriptionLogprobs = new Map<string, { logprobs: SpeechToTextLogprob[]; createdAt: number }>();

function emptyTranscriptionResult(includeLogprobs?: boolean): string | AudioTranscriptionResult {
  return includeLogprobs ? { text: "", logprobs: [] } : "";
}

function transcriptCacheKey(transcript: string): string {
  const normalized = transcript.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : "";
}

function rememberTranscriptionLogprobs(transcript: string, logprobs?: SpeechToTextLogprob[]): void {
  if (!logprobs || logprobs.length === 0) return;
  const key = transcriptCacheKey(transcript);
  if (!key) return;
  const now = Date.now();
  for (const [cachedKey, cached] of Array.from(recentTranscriptionLogprobs.entries())) {
    if (now - cached.createdAt > TRANSCRIPTION_LOGPROB_CACHE_TTL_MS) {
      recentTranscriptionLogprobs.delete(cachedKey);
    }
  }
  recentTranscriptionLogprobs.set(key, { logprobs, createdAt: now });
}

function recentLogprobsForTranscript(transcript: string): SpeechToTextLogprob[] | undefined {
  const candidates = [
    transcript,
    transcript.split(/\n\s*\nFollow-up answer:/i)[0] || "",
  ];
  const now = Date.now();
  for (const candidate of candidates) {
    const key = transcriptCacheKey(candidate);
    const cached = key ? recentTranscriptionLogprobs.get(key) : undefined;
    if (!cached) continue;
    if (now - cached.createdAt > TRANSCRIPTION_LOGPROB_CACHE_TTL_MS) {
      recentTranscriptionLogprobs.delete(key);
      continue;
    }
    return cached.logprobs;
  }
  return undefined;
}

export async function transcribeAudio(
  audioDataUrl: string,
  questionContext?: string,
  options?: AudioTranscriptionOptions & { includeLogprobs?: false }
): Promise<string>;
export async function transcribeAudio(
  audioDataUrl: string,
  questionContext: string | undefined,
  options: AudioTranscriptionOptions & { includeLogprobs: true }
): Promise<AudioTranscriptionResult>;
export async function transcribeAudio(
  audioDataUrl: string,
  questionContext?: string,
  options?: AudioTranscriptionOptions
): Promise<string | AudioTranscriptionResult> {
  try {
    console.log("[AUDIO] Starting audio transcription, data URL length:", audioDataUrl.length);
    
    const base64Separator = ";base64,";
    const separatorIndex = audioDataUrl.indexOf(base64Separator);
    
    if (separatorIndex === -1) {
      console.error("[AUDIO] Invalid audio data URL format - no ;base64, separator found");
      return emptyTranscriptionResult(options?.includeLogprobs);
    }
    
    const metadataPart = audioDataUrl.substring(0, separatorIndex);
    const base64Data = audioDataUrl.substring(separatorIndex + base64Separator.length);
    
    console.log("[AUDIO] Metadata:", metadataPart);
    
    const audioBuffer = Buffer.from(base64Data, "base64");
    console.log("[AUDIO] Audio buffer size:", audioBuffer.length, "bytes");

    if (audioBuffer.length < 1000) {
      console.error("[AUDIO] Audio buffer too small, likely invalid recording");
      return emptyTranscriptionResult(options?.includeLogprobs);
    }

    const { buffer: compatibleBuffer, format: compatibleFormat } = await ensureCompatibleFormat(audioBuffer);
    console.log("[AUDIO] Converted to compatible format:", compatibleFormat);

    const prompt = options?.quality === "high"
      ? OFFICIAL_EXAM_TRANSCRIPTION_PROMPT
      : questionContext
        ? `The student is answering: "${questionContext}". Transcribe their spoken response accurately, using numbers and symbols where appropriate.`
        : undefined;
    const transcription = await speechToText(compatibleBuffer, compatibleFormat, prompt, {
      includeLogprobs: true,
      quality: options?.quality ?? "standard",
    });

    rememberTranscriptionLogprobs(transcription.text, transcription.logprobs);
    console.log("[AUDIO] Transcription result length:", transcription.text.length);
    return options?.includeLogprobs ? transcription : transcription.text || "";
  } catch (error: any) {
    console.error("[AUDIO] Transcription failed:", error?.message || error);
    return emptyTranscriptionResult(options?.includeLogprobs);
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
const MIN_CLEAR_PRACTICE_WORDS = 2;
const MIN_CLEAR_PRACTICE_CHARS = 8;
const MIN_TRANSCRIPTION_AVG_LOGPROB = -1.2;
const NO_CLEAR_ANSWER_MESSAGE = "We could not detect a clear answer. Please try recording again.";
const PRACTICE_FILLER_WORDS = new Set(["um", "uh", "hmm", "ah", "mm", "er", "erm"]);

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
function practiceProfileFromDimensions(
  parsed: any,
  fallbackLanguage = "unknown",
  unscoredDimensions = new Set<string>(),
): VoxScoreProfile {
  const dimensions: VoxDimensionScore[] = voxDimensions.map((dimension) => {
    const d = Array.isArray(parsed?.dimensions)
      ? parsed.dimensions.find((x: any) => x?.dimension === dimension)
      : undefined;
    const toStrArr = (v: any): string[] =>
      Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim().length > 0) : [];
    if (unscoredDimensions.has(dimension) || d?.band === null) {
      return {
        dimension,
        band: null,
        weightedScore: null,
        evidence: typeof d?.evidence === "string" ? d.evidence : "Not evaluated due to incomplete answer.",
        conceptsPresent: toStrArr(d?.conceptsPresent),
        conceptsMissing: toStrArr(d?.conceptsMissing),
        conceptsIncorrect: toStrArr(d?.conceptsIncorrect),
      } as VoxDimensionScore;
    }
    const band = clampBand(typeof d?.band === "number" ? d.band : 3);
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

  const scored = dimensions.filter((d) => d.weightedScore !== null);
  const totalScore = scored.reduce((sum, d) => sum + (d.weightedScore || 0), 0);
  const scoredWeight = scored.reduce((sum, d) => sum + VOX_DIMENSION_WEIGHTS[d.dimension] * 100, 0);
  const normalizedTotal = scoredWeight > 0 ? Math.min(100, totalScore / (scoredWeight / 100)) : 0;
  const confidenceLevel =
    parsed?.confidenceLevel === "high" || parsed?.confidenceLevel === "medium" || parsed?.confidenceLevel === "low"
      ? parsed.confidenceLevel
      : "medium";
  const languageDetected = typeof parsed?.languageDetected === "string" ? parsed.languageDetected : fallbackLanguage;

  return {
    dimensions,
    totalScore: normalizedTotal,
    passFail: normalizedTotal >= VOX_PASS_THRESHOLD ? "pass" : "fail",
    confidenceLevel,
    asrQualityFlag: "ok",
    languageDetected,
  };
}

function unscoredPracticeProfile(reason: string, language = "unknown"): VoxScoreProfile {
  return {
    dimensions: voxDimensions.map((dimension) => ({
      dimension,
      band: null,
      weightedScore: null,
      evidence: reason,
      conceptsPresent: [],
      conceptsMissing: [],
      conceptsIncorrect: [],
    })) as VoxDimensionScore[],
    totalScore: 0,
    passFail: "fail",
    confidenceLevel: "low",
    asrQualityFlag: "needs_human_review",
    languageDetected: language,
  };
}

function normalizedPracticeText(text: string): string {
  return (text || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function practiceWordCount(text: string): number {
  return normalizedPracticeText(text)
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !PRACTICE_FILLER_WORDS.has(word.toLowerCase()))
    .length;
}

function extractAverageLogprob(logprobs?: SpeechToTextLogprob[]): number | undefined {
  const values = (logprobs || [])
    .map((item) => item.logprob)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function practiceTranscriptHasClearAnswer(transcript: string, logprobs?: SpeechToTextLogprob[]): boolean {
  const normalized = normalizedPracticeText(transcript);
  if (normalized.length < MIN_CLEAR_PRACTICE_CHARS) return false;
  if (practiceWordCount(normalized) < MIN_CLEAR_PRACTICE_WORDS) return false;
  const avgLogprob = extractAverageLogprob(logprobs);
  if (avgLogprob !== undefined && avgLogprob < MIN_TRANSCRIPTION_AVG_LOGPROB) return false;
  return true;
}

function practiceScoredDimensionsFromTranscript(transcript: string): Set<string> {
  const normalized = normalizedPracticeText(transcript);
  const words = practiceWordCount(normalized);
  if (normalized.length < MIN_CLEAR_PRACTICE_CHARS || words < MIN_CLEAR_PRACTICE_WORDS) {
    return new Set();
  }
  if (words < 6) {
    return new Set(["D6"]);
  }
  if (words < 12) {
    return new Set(["D5", "D6"]);
  }
  return new Set(voxDimensions);
}

function practiceScoreCoverageStatus(transcript: string, logprobs?: SpeechToTextLogprob[]): PracticeCoverageStatus {
  if (!practiceTranscriptHasClearAnswer(transcript, logprobs)) return "insufficient";
  const scored = practiceScoredDimensionsFromTranscript(transcript);
  if (scored.size === 0) return "insufficient";
  if (scored.size < voxDimensions.length) return "partial";
  return "full";
}

function practiceScoringPrompt(params: {
  questionText: string;
  answerText: string;
  mode: "micro" | "readiness";
  materialsText?: string;
  partialDimensionSet?: Set<string>;
}): string {
  const partialSet = params.partialDimensionSet;
  const unscoredList = partialSet && partialSet.size < voxDimensions.length
    ? voxDimensions.filter((dimension) => !partialSet.has(dimension))
    : [];
  const unscoredInstruction = unscoredList.length > 0
    ? `\nIf the answer is too short or incomplete to judge some dimensions, set the band for those dimensions to null and explain briefly in the evidence. The dimensions that may remain unscored are: ${unscoredList.join(", ")}.`
    : "";
  const materialsSection = params.materialsText
    ? `\nReference materials / topic context:\n${params.materialsText}\n`
    : "";
  const modeInstruction = params.mode === "micro"
    ? "You are scoring one answer during a practice session. Focus on actionable, concise evidence."
    : "You are scoring a finished practice session answer and should produce a full diagnostic profile.";

  return `${modeInstruction}
Question: ${params.questionText}
${materialsSection}
Student answer: ${params.answerText}

${PRACTICE_BILINGUAL_CLAUSE}${unscoredInstruction}

Score the answer across the seven VoxScore dimensions using bands 1-5, where 1 is Inadequate and 5 is Exemplary.
Return ONLY a JSON object in this exact shape:
{
  "dimensions": [
    {"dimension":"D1","band":4,"evidence":"...","conceptsPresent":["..."],"conceptsMissing":["..."],"conceptsIncorrect":["..."]},
    {"dimension":"D2","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D3","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D4","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D5","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D6","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]},
    {"dimension":"D7","band":3,"evidence":"...","conceptsPresent":[],"conceptsMissing":[],"conceptsIncorrect":[]}
  ],
  "confidenceLevel": "high" | "medium" | "low",
  "languageDetected": "english" | "arabic" | "mixed" | "other"
}`;
}

export async function generatePracticeQuestion(params: {
  sourceType: string;
  sourceSummary?: string;
  materialsText?: string;
  studentTopic?: string;
  language?: string;
  difficulty?: "easy" | "medium" | "hard";
  customApiKey?: string | null;
}): Promise<string[]> {
  const client = practiceClient(params.customApiKey);
  const difficulty = params.difficulty || "medium";
  const languageInstruction = params.language === "arabic"
    ? "Write all output in Arabic."
    : params.language === "english"
      ? "Write all output in English."
      : "Use the language most likely to help a UAE university student, and keep terminology academically accurate.";
  const sourceSection = params.materialsText
    ? `Materials the student provided:\n${params.materialsText}`
    : params.sourceSummary
      ? `Topic summary: ${params.sourceSummary}`
      : params.studentTopic
        ? `Requested topic: ${params.studentTopic}`
        : "The student wants a general oral practice prompt.";

  const prompt = `You are creating oral practice questions for VoxPractice, a private student self-study tool.
${languageInstruction}
Difficulty: ${difficulty}.
${sourceSection}

Return ONLY a JSON object with this shape:
{"questions":["question 1","question 2","question 3"]}

Each question should be oral-exam friendly, academically serious, and distinct from the others.`;

  try {
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter((value: unknown) => typeof value === "string" && value.trim().length > 0)
      : [];
    return questions.slice(0, 3);
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeQuestion failed:", error);
    return [];
  }
}

export async function generatePracticeProbe(params: {
  questionText: string;
  answerText: string;
  materialsText?: string;
  language?: string;
  customApiKey?: string | null;
}): Promise<string> {
  const client = practiceClient(params.customApiKey);
  const prompt = `You are the VoxPractice coach. Ask ONE short follow-up question that deepens the student's thinking without giving away the answer.

Approved probe styles:
- ${PRACTICE_APPROVED_PROBES.join("\n- ")}

Question: ${params.questionText}
Student answer: ${params.answerText}
${params.materialsText ? `Reference materials:\n${params.materialsText}\n` : ""}
${PRACTICE_BILINGUAL_CLAUSE}

Rules:
- Ask exactly one open-ended question.
- Do not answer the question for the student.
- Do not reveal or suggest the correct answer.
- Match the student's language when possible.
- Keep it under 18 words.

Return ONLY the follow-up question as plain text.`;

  try {
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 80,
    });
    return completion.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeProbe failed:", error);
    return "";
  }
}

export async function generatePracticeMicroFeedback(params: {
  questionText: string;
  answerText: string;
  transcriptLogprobs?: SpeechToTextLogprob[];
  materialsText?: string;
  customApiKey?: string | null;
}): Promise<{ microFeedback: string; voxScoreProfile: VoxScoreProfile }> {
  const coverage = practiceScoreCoverageStatus(params.answerText, params.transcriptLogprobs);
  if (coverage === "insufficient") {
    return {
      microFeedback: NO_CLEAR_ANSWER_MESSAGE,
      voxScoreProfile: unscoredPracticeProfile(NO_CLEAR_ANSWER_MESSAGE),
    };
  }

  const client = practiceClient(params.customApiKey);
  const scoredDimensions = practiceScoredDimensionsFromTranscript(params.answerText);
  const scoringPrompt = practiceScoringPrompt({
    questionText: params.questionText,
    answerText: params.answerText,
    mode: "micro",
    materialsText: params.materialsText,
    partialDimensionSet: scoredDimensions,
  });
  const feedbackPrompt = `You are the VoxPractice coach. Give concise micro-feedback on one spoken answer.
Question: ${params.questionText}
Student answer: ${params.answerText}
${params.materialsText ? `Reference materials:\n${params.materialsText}\n` : ""}
${PRACTICE_BILINGUAL_CLAUSE}

Write 2 short sentences:
1. One sentence naming the clearest strength.
2. One sentence naming the next thing to improve.
No bullet points. Match the student's language when possible.`;

  try {
    const [scoringCompletion, feedbackCompletion] = await Promise.all([
      client.chat.completions.create({
        model: PRACTICE_MODEL,
        messages: [{ role: "user", content: scoringPrompt }],
        temperature: 0.2,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      }),
      client.chat.completions.create({
        model: PRACTICE_MODEL,
        messages: [{ role: "user", content: feedbackPrompt }],
        temperature: 0.4,
        max_tokens: 180,
      }),
    ]);

    const parsed = JSON.parse(scoringCompletion.choices[0]?.message?.content?.trim() || "{}");
    const voxScoreProfile = practiceProfileFromDimensions(
      parsed,
      typeof parsed?.languageDetected === "string" ? parsed.languageDetected : "unknown",
      new Set(voxDimensions.filter((dimension) => !scoredDimensions.has(dimension)))
    );
    const microFeedback = feedbackCompletion.choices[0]?.message?.content?.trim() || "";
    return { microFeedback, voxScoreProfile };
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeMicroFeedback failed:", error);
    return { microFeedback: "", voxScoreProfile: fallbackProfile(0) };
  }
}

export async function generatePracticeReadinessReport(params: {
  questions: PracticeQuestion[];
  customApiKey?: string | null;
}): Promise<{
  overallReadinessScore: number;
  overallVoxScoreProfile?: VoxScoreProfile;
  conceptCoverageMap: Record<string, PracticeCoverageStatus>;
  strongestDimension?: VoxDimension;
  weakestDimension?: VoxDimension;
  summary: string;
}> {
  const answered = (params.questions || []).filter((q) => q.voxScoreProfile);
  const profiles = answered.map((q) => q.voxScoreProfile!).filter(Boolean);
  const overallVoxScoreProfile = aggregateProfiles(profiles);
  const overallReadinessScore = overallVoxScoreProfile ? overallVoxScoreProfile.totalScore : 0;

  const conceptCoverageMap: Record<string, PracticeCoverageStatus> = {};
  for (const q of answered) {
    conceptCoverageMap[q.id] = q.coverageStatus || "full";
  }

  let strongestDimension: VoxDimension | undefined;
  let weakestDimension: VoxDimension | undefined;
  if (overallVoxScoreProfile) {
    const scoredDims = overallVoxScoreProfile.dimensions.filter((d) => d.weightedScore !== null);
    if (scoredDims.length > 0) {
      strongestDimension = [...scoredDims].sort((a, b) => (b.weightedScore || 0) - (a.weightedScore || 0))[0].dimension;
      weakestDimension = [...scoredDims].sort((a, b) => (a.weightedScore || 0) - (b.weightedScore || 0))[0].dimension;
    }
  }

  const client = practiceClient(params.customApiKey);
  const reportPrompt = `You are summarizing a VoxPractice session.
Provide a short readiness summary for the student based on these question-level notes:
${answered.map((q) => `Question: ${q.text}\nFeedback: ${q.microFeedback || "None"}`).join("\n\n")}

${PRACTICE_BILINGUAL_CLAUSE}
Write 3-4 sentences, focused on what the student can do next. Match the language used in most of the notes.`;

  let summary = "";
  try {
    const completion = await client.chat.completions.create({
      model: PRACTICE_MODEL,
      messages: [{ role: "user", content: reportPrompt }],
      temperature: 0.5,
      max_tokens: 220,
    });
    summary = completion.choices[0]?.message?.content?.trim() || "";
  } catch (error) {
    console.error("[VOXPRACTICE] generatePracticeReadinessReport failed:", error);
  }

  return {
    overallReadinessScore,
    overallVoxScoreProfile,
    conceptCoverageMap,
    strongestDimension,
    weakestDimension,
    summary,
  };
}

function fallbackScore(question: Question, response: string): number {
  // Simple keyword overlap fallback scoring
  if (!question.correctAnswer) return 0.7;

  const correctWords = question.correctAnswer.toLowerCase().split(/\s+/);
  const responseWords = response.toLowerCase().split(/\s+/);

  const matches = correctWords.filter(word => 
    responseWords.some(respWord => respWord.includes(word) || word.includes(respWord))
  ).length;

  return Math.min(1, matches / Math.max(correctWords.length, 3));
}

async function evaluateResponse(
  question: Question,
  response: string,
  audioData?: string,
  materialContext?: string,
  customApiKey?: string | null
): Promise<EvalResult> {
  if (question.type === "mcq") {
    const score =
      response.trim().toLowerCase() === (question.correctAnswer || "").trim().toLowerCase()
        ? 1.0
        : 0.0;
    return { score, understandingScore: score, method: "exact" };
  }

  // If audio data is provided, transcribe it first
  if (audioData) {
    const transcript = await transcribeAudio(audioData, question.text, { quality: "high" }) as string;
    const transcriptText = transcript.trim();
    if (transcriptText.length > 0) {
      return evaluateWithAI(question, transcriptText, materialContext, customApiKey).then((result) => ({
        ...result,
        transcript,
      }));
    }

    if (response.trim().length === 0) {
      return { score: 0.0, understandingScore: 0.0, method: "fallback", transcript };
    }
  }

  if (response.trim().length === 0) {
    return { score: 0.0, understandingScore: 0.0, method: "fallback" };
  }

  return evaluateWithAI(question, response, materialContext, customApiKey);
}

async function generateFeedback(
  exam: Exam,
  responses: ExamResponse[],
  scores: Record<string, number>,
  understandingScores: Record<string, number>,
  materialContext?: string,
  customApiKey?: string | null
): Promise<{ strengths: string; weakPoints: string; recommendations: string }> {
  try {
    const qaSummary = responses.map(r => {
      const question = exam.questions.find(q => q.id === r.questionId);
      const answerText = r.transcript || r.response || "No answer";
      return `Q: ${question?.text}\nA: ${answerText}\nCorrectness: ${(scores[r.questionId] * 100).toFixed(0)}%\nUnderstanding: ${((understandingScores[r.questionId] ?? scores[r.questionId]) * 100).toFixed(0)}%`;
    }).join("\n\n");

    const materialSection = materialContext
      ? `\nClass Materials Context:\n${materialContext}\n`
      : "";

    const prompt = `You are a helpful university professor providing feedback on a student's oral exam performance.${materialSection}
Exam: ${exam.title}

Performance Summary:
${qaSummary}

Provide concise feedback in JSON format:
{
  "strengths": "2-3 sentences about what the student did well",
  "weakPoints": "2-3 sentences about areas needing improvement",
  "recommendations": "2-3 specific actionable recommendations for improvement"
}`;

    const client = customApiKey ? new OpenAI({ apiKey: customApiKey }) : openai;
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(raw);

    return {
      strengths: parsed.strengths || "Good effort on the exam.",
      weakPoints: parsed.weakPoints || "Review the material more thoroughly.",
      recommendations: parsed.recommendations || "Continue practicing and reviewing key concepts.",
    };
  } catch (error) {
    console.error("AI feedback generation failed:", error);
    return {
      strengths: "You completed the exam successfully.",
      weakPoints: "Some areas may need more review.",
      recommendations: "Continue studying and practice similar questions.",
    };
  }
}

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Partial<User>): Promise<User>;
  updateUserRole(userId: string, role: string, universityId?: string): Promise<User | undefined>;
  updateUserOpenAIKey(userId: string, apiKey: string | null): Promise<User | undefined>;

  // University methods
  getUniversity(id: string): Promise<University | undefined>;
  getAllUniversities(): Promise<University[]>;
  createUniversity(university: InsertUniversity): Promise<University>;
  updateUniversityApiKey(universityId: string, apiKey: string | null): Promise<University | undefined>;

  // Class methods
  getClass(id: string): Promise<Class | undefined>;
  getClassesByProfessor(professorId: string): Promise<Class[]>;
  getClassByJoinCode(code: string): Promise<Class | undefined>;
  createClass(classData: InsertClass & { professorId: string }): Promise<Class>;
  deleteClass(id: string): Promise<boolean>;
  regenerateClassJoinCode(classId: string): Promise<Class | undefined>;

  // Enrollment methods
  getEnrollmentsByClass(classId: string): Promise<Enrollment[]>;
  getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]>;
  enrollStudent(enrollment: InsertEnrollment): Promise<Enrollment>;
  unenrollStudent(classId: string, studentId: string): Promise<boolean>;

  // Exam methods
  getExam(id: string): Promise<Exam | undefined>;
  getExamByAccessCode(code: string): Promise<Exam | undefined>;
  getExamsByProfessor(professorId: string): Promise<Exam[]>;
  getExamsByClass(classId: string): Promise<Exam[]>;
  createExam(exam: InsertExam & { professorId: string }): Promise<Exam>;
  updateExam(id: string, updates: Partial<Exam>): Promise<Exam | undefined>;
  deleteExam(id: string): Promise<boolean>;
  regenerateExamAccessCode(examId: string): Promise<Exam | undefined>;

  // Submission methods
  getSubmission(id: string): Promise<ExamSubmission | undefined>;
  getSubmissionsByExam(examId: string): Promise<ExamSubmission[]>;
  getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]>;
  getStudentSubmissionForExam(examId: string, studentId: string): Promise<ExamSubmission | undefined>;
  createSubmission(
    examId: string,
    studentId: string,
    responses: ExamResponse[],
    materialContext?: string,
    customApiKey?: string | null,
    isPreview?: boolean,
    consent?: { consentGiven?: boolean; consentTimestamp?: string }
  ): Promise<ExamSubmission>;
  updateSubmissionScore(submissionId: string, questionId: string, newScore: number, newUnderstandingScore?: number): Promise<ExamSubmission | undefined>;
  updateSubmissionDecision(submissionId: string, data: { professorDecision: string; professorOverrideReason?: string | null; professorHolisticScore?: number | null; professorReviewDurationMinutes?: number | null; gradingGap: number; arabicFlag: boolean; }): Promise<ExamSubmission | undefined>;

  // Practice session methods
  createPracticeSession(studentId: string, data: InsertPracticeSession): Promise<PracticeSession>;
  getPracticeSession(id: string): Promise<PracticeSession | undefined>;
  getPracticeSessionsByStudent(studentId: string): Promise<PracticeSession[]>;
  updatePracticeSession(id: string, updates: Partial<PracticeSession>): Promise<PracticeSession | undefined>;

  // Support request methods
  createSupportRequest(data: { userId: string; userName?: string; userRole?: string; message?: string; pageUrl?: string }): Promise<SupportRequest>;
  getSupportRequests(): Promise<SupportRequest[]>;
  updateSupportRequestStatus(id: string, status: string): Promise<SupportRequest | undefined>;
  getSupportRequest(id: string): Promise<SupportRequest | undefined>;
  getChatMessages(supportRequestId: string): Promise<ChatMessage[]>;
  createChatMessage(data: { supportRequestId: string; senderId: string; senderRole: string; message: string }): Promise<ChatMessage>;

  // Analytics
  getExamAnalytics(examId: string): Promise<any>;
}

async function generateExamAccessCode(): Promise<string> {
  let code: string;
  let existing: Exam | undefined;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
    existing = await storage.getExamByAccessCode(code);
  } while (existing);
  return code;
}

async function generateClassJoinCode(): Promise<string> {
  let code: string;
  let existing: Class | undefined;
  do {
    code = Math.random().toString(36).slice(2, 8).toUpperCase();
    existing = await storage.getClassByJoinCode(code);
  } while (existing);
  return code;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: Partial<User>): Promise<User> {
    const [user] = await db.insert(users).values({
      ...insertUser,
      role: insertUser.role || "student",
    }).returning();
    return user;
  }

  async updateUserRole(userId: string, role: string, universityId?: string): Promise<User | undefined> {
    const updates: any = { role, updatedAt: new Date() };
    if (universityId !== undefined) updates.universityId = universityId;
    const [user] = await db.update(users).set(updates).where(eq(users.id, userId)).returning();
    return user || undefined;
  }

  async updateUserOpenAIKey(userId: string, apiKey: string | null): Promise<User | undefined> {
    const [user] = await db.update(users).set({ openaiApiKey: apiKey, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return user || undefined;
  }

  async getUniversity(id: string): Promise<University | undefined> {
    const [university] = await db.select().from(universities).where(eq(universities.id, id));
    return university || undefined;
  }

  async getAllUniversities(): Promise<University[]> {
    return db.select().from(universities);
  }

  async createUniversity(insertUniversity: InsertUniversity): Promise<University> {
    const [university] = await db.insert(universities).values(insertUniversity).returning();
    return university;
  }

  async updateUniversityApiKey(universityId: string, apiKey: string | null): Promise<University | undefined> {
    const [university] = await db.update(universities).set({ openaiApiKey: apiKey }).where(eq(universities.id, universityId)).returning();
    return university || undefined;
  }

  async getClass(id: string): Promise<Class | undefined> {
    const [cls] = await db.select().from(classes).where(eq(classes.id, id));
    return cls || undefined;
  }

  async getClassesByProfessor(professorId: string): Promise<Class[]> {
    return db.select().from(classes).where(eq(classes.professorId, professorId));
  }

  async createClass(insertClass: InsertClass & { professorId: string }): Promise<Class> {
    const joinCode = await generateClassJoinCode();
    const [cls] = await db.insert(classes).values({
      ...insertClass,
      joinCode,
    }).returning();
    return cls;
  }

  async deleteClass(id: string): Promise<boolean> {
    const result = await db.delete(classes).where(eq(classes.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getEnrollmentsByClass(classId: string): Promise<Enrollment[]> {
    return db.select().from(enrollments).where(eq(enrollments.classId, classId));
  }

  async getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
    return db.select().from(enrollments).where(eq(enrollments.studentId, studentId));
  }

  async enrollStudent(insertEnrollment: InsertEnrollment): Promise<Enrollment> {
    const [enrollment] = await db.insert(enrollments).values(insertEnrollment).returning();
    return enrollment;
  }

  async unenrollStudent(classId: string, studentId: string): Promise<boolean> {
    const result = await db.delete(enrollments).where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId)));
    return (result.rowCount || 0) > 0;
  }

  async getExam(id: string): Promise<Exam | undefined> {
    const [exam] = await db.select().from(exams).where(eq(exams.id, id));
    return exam || undefined;
  }

  async getExamsByProfessor(professorId: string): Promise<Exam[]> {
    return db.select().from(exams).where(eq(exams.professorId, professorId));
  }

  async getExamsByClass(classId: string): Promise<Exam[]> {
    return db.select().from(exams).where(eq(exams.classId, classId));
  }

  async createExam(insertExam: InsertExam & { professorId: string }): Promise<Exam> {
    let accessCode: string | null = null;
    let accessCodeExpiresAt: Date | null = null;

    if (insertExam.mode === "quickvox") {
      // QuickVox links stay valid longer since anyone can join without login.
      accessCode = await generateExamAccessCode();
      accessCodeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else {
      accessCode = await generateExamAccessCode();
      accessCodeExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    }

    const [exam] = await db.insert(exams).values({
      ...insertExam,
      accessCode,
      accessCodeExpiresAt,
    }).returning();
    return exam;
  }

  async updateExam(id: string, updates: Partial<Exam>): Promise<Exam | undefined> {
    const [exam] = await db.update(exams).set(updates).where(eq(exams.id, id)).returning();
    return exam || undefined;
  }

  async deleteExam(id: string): Promise<boolean> {
    const result = await db.delete(exams).where(eq(exams.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getSubmission(id: string): Promise<ExamSubmission | undefined> {
    const [submission] = await db.select().from(submissions).where(eq(submissions.id, id));
    return submission || undefined;
  }

  async getSubmissionsByExam(examId: string): Promise<ExamSubmission[]> {
    return db.select().from(submissions).where(eq(submissions.examId, examId));
  }

  async getSubmissionsByStudent(studentId: string): Promise<ExamSubmission[]> {
    return db.select().from(submissions).where(eq(submissions.studentId, studentId));
  }

  async getStudentSubmissionForExam(examId: string, studentId: string): Promise<ExamSubmission | undefined> {
    const [submission] = await db.select().from(submissions).where(and(eq(submissions.examId, examId), eq(submissions.studentId, studentId), eq(submissions.isPreview, "false")));
    return submission || undefined;
  }

  async createSubmission(
    examId: string,
    studentId: string,
    responses: ExamResponse[],
    materialContext?: string,
    customApiKey?: string | null,
    isPreview = false,
    consent?: { consentGiven?: boolean; consentTimestamp?: string }
  ): Promise<ExamSubmission> {
    const exam = await this.getExam(examId);
    if (!exam) throw new Error("Exam not found");

    if (exam.mode === "quickvox") {
      const question = exam.questions[0];
      const firstResponse = responses[0];
      const transcript = firstResponse?.response || "";
      let quickvoxInsight: string | null = null;
      let quickvoxFollowUp: string | null = null;

      if (question && transcript.trim()) {
        try {
          const result = await evaluateQuickVoxAnswer(question.text, transcript, customApiKey);
          quickvoxInsight = result.insight;
          quickvoxFollowUp = result.followUp;
        } catch (error) {
          console.error("[QUICKVOX] Failed to generate insight:", error);
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
        consentGiven: consent?.consentGiven ?? false,
        consentTimestamp: consent?.consentTimestamp ?? null,
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
      consentGiven: consent?.consentGiven ?? false,
      consentTimestamp: consent?.consentTimestamp ?? null,
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
    if (updates.consentGiven !== undefined) updateData.consentGiven = updates.consentGiven;
    if (updates.consentTimestamp !== undefined) updateData.consentTimestamp = updates.consentTimestamp;
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
