import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { generateGeminiContent, generateGeminiContentStream, GEMINI_MODEL } from "../../config/gemini";

export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

export interface SpeechToTextLogprob {
  token?: string;
  bytes?: number[];
  logprob?: number;
}

export interface SpeechToTextResult {
  text: string;
  logprobs?: SpeechToTextLogprob[];
}

export type SpeechToTextQuality = "standard" | "high";

interface SpeechToTextOptions {
  includeLogprobs?: boolean;
  quality?: SpeechToTextQuality;
}

/**
 * Detect audio format from buffer magic bytes.
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    await writeFile(inputPath, audioBuffer);

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",
        "-f", "wav",
        "-ar", "16000",
        "-ac", "1",
        "-acodec", "pcm_s16le",
        "-y",
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {});
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

export async function ensureCompatibleFormat(
  audioBuffer: Buffer
): Promise<{ buffer: Buffer; format: "wav" | "mp3" }> {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

export async function voiceChat(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav",
  outputFormat: "wav" | "mp3" = "mp3"
): Promise<{ transcript: string; audioResponse: Buffer }> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await generateGeminiContent({
    model: GEMINI_MODEL,
    contents: [
      { inlineData: { mimeType: inputFormat === "mp3" ? "audio/mp3" : "audio/wav", data: audioBase64 } },
      { text: "Respond to the user's spoken input concisely." }
    ]
  });
  return {
    transcript: response?.text || "",
    audioResponse: Buffer.from(""),
  };
}

export async function voiceChatStream(
  audioBuffer: Buffer,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  inputFormat: "wav" | "mp3" = "wav"
): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  const audioBase64 = audioBuffer.toString("base64");
  const response = await generateGeminiContentStream({
    model: GEMINI_MODEL,
    contents: [
      { inlineData: { mimeType: inputFormat === "mp3" ? "audio/mp3" : "audio/wav", data: audioBase64 } },
      { text: "Respond to the user's spoken input concisely." }
    ]
  });

  return (async function* () {
    if (!response) return;
    for await (const chunk of response) {
      if (chunk.text) yield { type: "transcript" as const, data: chunk.text };
    }
  })();
}

export async function textToSpeech(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy",
  format: "wav" | "mp3" | "flac" | "opus" | "pcm16" = "wav"
): Promise<Buffer> {
  return Buffer.from("");
}

export async function textToSpeechStream(
  text: string,
  voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" = "alloy"
): Promise<AsyncIterable<string>> {
  return (async function* () {
    yield text;
  })();
}

export async function speechToText(
  audioBuffer: Buffer,
  format?: "wav" | "mp3" | "webm",
  prompt?: string
): Promise<string>;
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm",
  prompt: string | undefined,
  options?: SpeechToTextOptions & { includeLogprobs?: false }
): Promise<string>;
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm",
  prompt: string | undefined,
  options: SpeechToTextOptions & { includeLogprobs: true }
): Promise<SpeechToTextResult>;
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav",
  prompt?: string,
  options?: SpeechToTextOptions
): Promise<string | SpeechToTextResult> {
  try {
    const base64Audio = audioBuffer.toString("base64");
    const mimeType = format === "mp3" ? "audio/mp3" : format === "webm" ? "audio/webm" : "audio/wav";
    const response = await generateGeminiContent({
      model: GEMINI_MODEL,
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
        {
          text: prompt || "Transcribe the spoken audio response accurately. Preserve the original language.",
        },
      ],
    });
    const text = (response?.text || "").trim();
    const result = { text, logprobs: [] };
    return options?.includeLogprobs ? result : result.text;
  } catch (error: any) {
    console.error("Gemini speech-to-text error:", error);
    const result = { text: "", logprobs: [] };
    return options?.includeLogprobs ? result : "";
  }
}

export async function speechToTextStream(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" = "wav"
): Promise<AsyncIterable<string>> {
  const base64Audio = audioBuffer.toString("base64");
  const mimeType = format === "mp3" ? "audio/mp3" : format === "webm" ? "audio/webm" : "audio/wav";
  const response = await generateGeminiContentStream({
    model: GEMINI_MODEL,
    contents: [
      {
        inlineData: {
          mimeType,
          data: base64Audio,
        },
      },
      { text: "Transcribe the spoken audio response accurately." },
    ],
  });

  return (async function* () {
    if (!response) return;
    for await (const chunk of response) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  })();
}
