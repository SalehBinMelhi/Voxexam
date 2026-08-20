import { Type } from "@google/genai";
import { generateGeminiContent, GEMINI_MODEL, GEMINI_GRADING_MODEL } from "./config/gemini";
export interface ExamBlueprintConcept {
  id: string;
  title: string;
  description: string;
  learningObjectives: string[];
  expectedKeyPoints: string[];
  commonMisconceptions: string[];
  difficulty: "basic" | "intermediate" | "advanced";
  suggestedInitialQuestion: string;
  enabled?: boolean;
}

export interface ExamBlueprintTopic {
  id: string;
  title: string;
  description: string;
  importance: number;
  concepts: ExamBlueprintConcept[];
}

export interface ExamBlueprint {
  summary: string;
  courseName: string;
  topics: ExamBlueprintTopic[];
}

export interface AnswerEvaluationResult {
  transcript: string;
  answerSummary: string;
  coveredKeyPoints: string[];
  missingKeyPoints: string[];
  misconceptions: string[];
  correctness: "incorrect" | "partially_correct" | "mostly_correct" | "complete";
  score: number;
  confidence: number;
  nextAction: "follow_up" | "clarify" | "simplify" | "next_concept" | "finish_exam";
  followUpReason: string;
  nextQuestion: string | null;
  nextConceptId: string | null;
  studentFeedback: string;
}

export interface FinalExamReport {
  finalScore: number;
  topicScores: Record<string, number>;
  strengths: string[];
  weaknesses: string[];
  missingConcepts: string[];
  misconceptions: string[];
  recommendations: string[];
  futureSuggestions: string[];
}

/**
 * Step 1: Analyze lecture materials and generate structured Exam Blueprint
 */
export async function analyzeLectureMaterial(materialText: string): Promise<ExamBlueprint> {
  const prompt = `Analyze the following university lecture/course material. Build a structured exam blueprint for an oral examination.
Extract the main topics, underlying concepts, key learning objectives, expected student answer points, common misconceptions, difficulty level, and suggested initial oral exam questions.

LECTURE MATERIAL:
${materialText.slice(0, 50000)}

Output must strictly conform to the following JSON structure.`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      summary: { type: Type.STRING },
      courseName: { type: Type.STRING },
      topics: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            importance: { type: Type.NUMBER },
            concepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  learningObjectives: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  expectedKeyPoints: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  commonMisconceptions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  difficulty: { type: Type.STRING },
                  suggestedInitialQuestion: { type: Type.STRING },
                },
                required: [
                  "id",
                  "title",
                  "description",
                  "learningObjectives",
                  "expectedKeyPoints",
                  "commonMisconceptions",
                  "difficulty",
                  "suggestedInitialQuestion",
                ],
              },
            },
          },
          required: ["id", "title", "description", "importance", "concepts"],
        },
      },
    },
    required: ["summary", "courseName", "topics"],
  };

  try {
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    if (!response) throw new Error("No response received from Gemini API");
    const text = response.text || "{}";
    const parsed = JSON.parse(text) as ExamBlueprint;
    return parsed;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Step 2: Transcribe and evaluate student answer, then adaptively generate the next question
 */
export async function evaluateAnswerAndGenerateAdaptiveNextQuestion(params: {
  blueprint: ExamBlueprint;
  currentConcept: ExamBlueprintConcept;
  currentQuestion: string;
  studentAudioBase64?: string;
  audioMimeType?: string;
  studentTranscriptText?: string;
  previousLogs: Array<{
    question: string;
    conceptId: string;
    transcript: string;
    coveredPoints: string[];
    missingPoints: string[];
    misconceptions: string[];
    score: number;
  }>;
  followUpCountForConcept: number;
  maxFollowUpsPerConcept: number;
  totalQuestionsAsked: number;
  maxQuestions: number;
}): Promise<AnswerEvaluationResult> {
  const {
    currentConcept,
    currentQuestion,
    studentAudioBase64,
    audioMimeType = "audio/webm",
    studentTranscriptText,
    previousLogs,
    followUpCountForConcept,
    maxFollowUpsPerConcept,
    totalQuestionsAsked,
    maxQuestions,
  } = params;

  const contents: any[] = [];

  const systemContext = `You are an adaptive AI university oral examiner.
Target Concept: "${currentConcept.title}" - ${currentConcept.description}
Expected Key Points: ${JSON.stringify(currentConcept.expectedKeyPoints)}
Common Misconceptions: ${JSON.stringify(currentConcept.commonMisconceptions)}
Current Question Asked: "${currentQuestion}"
Previous Questions & Answers Log: ${JSON.stringify(previousLogs)}
Follow-up count for current concept: ${followUpCountForConcept} / ${maxFollowUpsPerConcept}
Total questions asked: ${totalQuestionsAsked} / ${maxQuestions}

ADAPTIVE QUESTIONING RULES:
1. If answer is substantially complete & correct: mark concept covered, set nextAction to "next_concept" (or "finish_exam" if max questions/concepts reached).
2. If answer is partially correct: identify missing key points. If followUpCount < maxFollowUpsPerConcept, set nextAction to "follow_up" and ask a targeted follow-up question specifically probing the missing point. DO NOT reveal the expected answer inside the question!
3. If answer contains a misconception: set nextAction to "clarify" and generate a diagnostic question giving the student an opportunity to correct it.
4. If answer is mostly incorrect: set nextAction to "simplify" and ask a simpler prerequisite question.
5. If followUpCount >= maxFollowUpsPerConcept or totalQuestionsAsked >= maxQuestions: set nextAction to "next_concept" or "finish_exam". Never loop indefinitely on one concept!
6. NEVER repeat an exact previous question.
7. DO NOT double penalize the student for the same missing point.

Task:
1. Transcribe the audio answer exactly (or verify student transcript text).
2. Evaluate answer correctness, covered key points, missing key points, misconceptions, score (0-100), and confidence (0-100).
3. Determine next action and generate next question if continuing.`;

  contents.push({ text: systemContext });

  if (studentAudioBase64) {
    contents.push({
      inlineData: {
        mimeType: audioMimeType,
        data: studentAudioBase64,
      },
    });
  } else if (studentTranscriptText) {
    contents.push({ text: `Student Transcript: "${studentTranscriptText}"` });
  } else {
    contents.push({ text: `[No audio or text provided by student]` });
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      transcript: { type: Type.STRING },
      answerSummary: { type: Type.STRING },
      coveredKeyPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      missingKeyPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      misconceptions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      correctness: { type: Type.STRING },
      score: { type: Type.NUMBER },
      confidence: { type: Type.NUMBER },
      nextAction: { type: Type.STRING },
      followUpReason: { type: Type.STRING },
      nextQuestion: { type: Type.STRING, nullable: true },
      nextConceptId: { type: Type.STRING, nullable: true },
      studentFeedback: { type: Type.STRING },
    },
    required: [
      "transcript",
      "answerSummary",
      "coveredKeyPoints",
      "missingKeyPoints",
      "misconceptions",
      "correctness",
      "score",
      "confidence",
      "nextAction",
      "followUpReason",
      "studentFeedback",
    ],
  };

  try {
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    if (!response) throw new Error("No response received from Gemini API");
    const result = JSON.parse(response.text || "{}") as AnswerEvaluationResult;
    result.score = Math.max(0, Math.min(100, Math.round(result.score || 0)));
    return result;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Step 3: Evaluate completed exam attempt and generate comprehensive final report
 */
export async function evaluateCompleteExamAttempt(params: {
  blueprint: ExamBlueprint;
  attemptLogs: Array<{
    question: string;
    conceptTitle: string;
    transcript: string;
    coveredPoints: string[];
    missingPoints: string[];
    misconceptions: string[];
    score: number;
  }>;
}): Promise<FinalExamReport> {
  const { blueprint, attemptLogs } = params;

  const prompt = `Synthesize the following complete oral examination attempt log.
EXAM BLUEPRINT: ${JSON.stringify(blueprint)}
STUDENT ATTEMPT LOGS: ${JSON.stringify(attemptLogs)}

Generate a final diagnostic evaluation including:
- Overall final score (0-100)
- Topic scores breakdown (map of topic title -> score out of 100)
- Strengths demonstrated
- Weaknesses identified
- Missing concepts
- Misconceptions noted
- Personalized recommendations for improvement
- Actionable suggestions for answering similar oral questions in the future`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      finalScore: { type: Type.NUMBER },
      topicScores: {
        type: Type.OBJECT,
        additionalProperties: { type: Type.NUMBER },
      },
      strengths: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      weaknesses: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      missingConcepts: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      misconceptions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      recommendations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      futureSuggestions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
    },
    required: [
      "finalScore",
      "topicScores",
      "strengths",
      "weaknesses",
      "missingConcepts",
      "misconceptions",
      "recommendations",
      "futureSuggestions",
    ],
  };

  try {
    const response = await generateGeminiContent({
      model: GEMINI_GRADING_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    if (!response) throw new Error("No response received from Gemini API");
    const report = JSON.parse(response.text || "{}") as FinalExamReport;
    report.finalScore = Math.max(0, Math.min(100, Math.round(report.finalScore || 0)));
    return report;
  } catch (error: any) {
    console.error("Gemini final evaluation error:", error);
    const totalLogScores = attemptLogs.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const avgScore = attemptLogs.length ? Math.round(totalLogScores / attemptLogs.length) : 0;
    return {
      finalScore: avgScore,
      topicScores: {},
      strengths: ["Completed oral assessment"],
      weaknesses: [],
      missingConcepts: [],
      misconceptions: [],
      recommendations: ["Review course topics for future exams."],
      futureSuggestions: ["Practice explaining concepts aloud."],
    };
  }
}

// ---------------------------------------------------------------------------
// Standard Exam: Oral Question Evaluation (0–10 scoring)
// ---------------------------------------------------------------------------

export interface OralAnswerEvaluation {
  transcript: string;
  answerSummary: string;
  coveredKeyPoints: string[];
  missingKeyPoints: string[];
  misconceptions: string[];
  score: number; // 0–10
  confidence: number; // 0–100
  gradingExplanation: string;
}

/**
 * Evaluate a student's oral answer against the professor's expected answer,
 * rubric, or key points. Returns a score from 0 to 10 with structured feedback.
 */
export async function evaluateOralAnswer(params: {
  questionText: string;
  expectedAnswer?: string;
  rubric?: string;
  keyPoints?: string[];
  studentAudioBase64?: string;
  audioMimeType?: string;
  studentTranscriptText?: string;
}): Promise<OralAnswerEvaluation> {
  const {
    questionText,
    expectedAnswer,
    rubric,
    keyPoints,
    studentAudioBase64,
    audioMimeType = "audio/webm",
    studentTranscriptText,
  } = params;

  const contents: any[] = [];

  let context = `You are a university professor evaluating a student's oral answer.

Question: "${questionText}"
`;

  if (expectedAnswer) {
    context += `Expected Answer: "${expectedAnswer}"\n`;
  }
  if (rubric) {
    context += `Grading Rubric: "${rubric}"\n`;
  }
  if (keyPoints && keyPoints.length > 0) {
    context += `Key Points to Cover: ${JSON.stringify(keyPoints)}\n`;
  }

  context += `
Task:
1. If audio is provided, transcribe it accurately.
2. Summarize the student's answer.
3. Identify covered key points, missing key points, and any misconceptions.
4. Score the answer from 0 to 10 (0 = completely wrong/no answer, 10 = perfect answer).
5. Provide a confidence level (0-100) in your evaluation.
6. Give a brief grading explanation.

Be fair but rigorous. Do not penalize informal language in spoken answers.
For oral answers, focus on conceptual understanding over exact wording.`;

  contents.push({ text: context });

  if (studentAudioBase64) {
    contents.push({
      inlineData: {
        mimeType: audioMimeType,
        data: studentAudioBase64,
      },
    });
  } else if (studentTranscriptText) {
    contents.push({ text: `Student's Spoken Answer (transcript): "${studentTranscriptText}"` });
  } else {
    contents.push({ text: "[No audio or text provided by student — score 0]" });
  }

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      transcript: { type: Type.STRING },
      answerSummary: { type: Type.STRING },
      coveredKeyPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      missingKeyPoints: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      misconceptions: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
      },
      score: { type: Type.NUMBER },
      confidence: { type: Type.NUMBER },
      gradingExplanation: { type: Type.STRING },
    },
    required: [
      "transcript",
      "answerSummary",
      "coveredKeyPoints",
      "missingKeyPoints",
      "misconceptions",
      "score",
      "confidence",
      "gradingExplanation",
    ],
  };

  try {
    const response = await generateGeminiContent({
      model: GEMINI_GRADING_MODEL,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.2,
      },
    });

    if (!response) throw new Error("No response received from Gemini API");
    const text = response.text || "{}";
    const result = JSON.parse(text) as OralAnswerEvaluation;

    // Validate and clamp score to 0–10
    result.score = Math.max(0, Math.min(10, Math.round(result.score ?? 0)));
    result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence ?? 50)));

    // Validate arrays
    if (!Array.isArray(result.coveredKeyPoints)) result.coveredKeyPoints = [];
    if (!Array.isArray(result.missingKeyPoints)) result.missingKeyPoints = [];
    if (!Array.isArray(result.misconceptions)) result.misconceptions = [];
    if (!result.transcript) result.transcript = studentTranscriptText || "[No transcript available]";
    if (!result.answerSummary) result.answerSummary = "No summary available.";
    if (!result.gradingExplanation) result.gradingExplanation = "Evaluation completed.";

    return result;
  } catch (error: any) {
    console.error("Gemini oral answer evaluation error:", error);
    throw error;
  }
}

