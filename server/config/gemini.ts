import "dotenv/config";
import { GoogleGenAI, GenerateContentParameters } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("CRITICAL STARTUP ERROR: GEMINI_API_KEY is not configured in environment variables.");
}

const envModel = process.env.GEMINI_MODEL;
if (!envModel) {
  throw new Error("CRITICAL STARTUP ERROR: GEMINI_MODEL is not configured in environment variables.");
}
export const GEMINI_MODEL: string = envModel;

const envGradingModel = process.env.GEMINI_GRADING_MODEL || GEMINI_MODEL;
export const GEMINI_GRADING_MODEL: string = envGradingModel;

export const geminiClient = new GoogleGenAI({ apiKey });

/**
 * Standardized error handler for Google Gemini API errors.
 * Ensures we don't expose raw API keys or internal stack traces to the frontend.
 */
function handleGeminiError(error: any): never {
  const status = error?.status || error?.code;
  const message = error?.message?.toLowerCase() || "";

  if (status === 401 || status === 403 || message.includes("api key") || message.includes("authentication")) {
    console.error("[Gemini] Authentication error. Check your API key.");
    throw new Error("AI Provider Error: Authentication failed.");
  }
  
  if (status === 404 || message.includes("not found") || message.includes("not available")) {
    console.error(`[Gemini] Model not found or unsupported: ${error.message}`);
    throw new Error("AI Provider Error: The requested AI model is unsupported or not found.");
  }
  
  if (status === 429 || message.includes("quota") || message.includes("rate limit") || message.includes("resource_exhausted")) {
    console.error("[Gemini] Rate limit or quota exceeded.");
    throw new Error("AI Provider Error: Rate limit or usage quota exceeded. Please try again later.");
  }

  if (status === 500 || status === 503 || message.includes("internal") || message.includes("unavailable")) {
    console.error(`[Gemini] Provider unavailable: ${error.message}`);
    throw new Error("AI Provider Error: The AI service is currently unavailable.");
  }

  // Fallback generic error
  console.error("[Gemini] Unexpected error:", error.message || error);
  throw new Error("AI Provider Error: An unexpected error occurred while processing your request.");
}

/**
 * Wrapper for generating content with centralized error handling.
 */
export async function generateGeminiContent(params: GenerateContentParameters) {
  try {
    return await geminiClient.models.generateContent(params);
  } catch (error: any) {
    handleGeminiError(error);
  }
}

/**
 * Wrapper for streaming content with centralized error handling.
 */
export async function generateGeminiContentStream(params: GenerateContentParameters) {
  try {
    return await geminiClient.models.generateContentStream(params);
  } catch (error: any) {
    handleGeminiError(error);
  }
}
