import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StudentVoxScore } from "@/components/voxscore-breakdown";
import { VoiceConsentDialog } from "@/components/voice-consent-dialog";
import { voxWeakest, voxFriendlyName } from "@/lib/voxscore";
import { useToast } from "@/hooks/use-toast";
import type {
  PracticeSession,
  PracticeQuestion,
  PracticeSourceType,
  PracticeSessionMode,
  PracticeCoachStyle,
  PracticeCoverageStatus,
  VoxScoreProfile,
} from "@shared/schema";
import {
  Upload,
  BookOpen,
  PenLine,
  Sparkles,
  Mic,
  Square,
  Clock,
  Lock,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  SkipForward,
  Trophy,
  Loader2,
  FileText,
  Target,
  Lightbulb,
  ThumbsUp,
} from "lucide-react";

const PREP_SECONDS = 15;
const MIN_CLEAR_ANSWER_CHARS = 15;
const MIN_RECORDING_DURATION_MS = 1500;
const MIN_RECORDING_RMS_DBFS = -45;
const UNCLEAR_AUDIO_MESSAGE = "We could not detect a clear answer. Please try recording again.";

interface MaterialSummary {
  summary: string;
  concepts: string[];
  topics: string[];
  sampleQuestions: string[];
  detectedLanguage: string;
}

type Phase = "material" | "session" | "consent" | "loop" | "report";
type LoopStep = "prep" | "record_main" | "processing" | "probe" | "feedback";

interface CurrentFeedback {
  microFeedback: string;
  voxScoreProfile: VoxScoreProfile;
}

const MODES: {
  id: PracticeSessionMode;
  en: string;
  ar: string;
  desc: string;
  count: number;
  range: string;
  needsPrior?: boolean;
  isDefault?: boolean;
}[] = [
  { id: "warmup", en: "Warm-up", ar: "إحماء", desc: "A few quick questions to get going", count: 4, range: "3–4 questions" },
  {
    id: "readiness_sprint",
    en: "Readiness Sprint",
    ar: "اختبار الجاهزية",
    desc: "The recommended readiness check",
    count: 8,
    range: "7–10 questions",
    isDefault: true,
  },
  {
    id: "weak_spot",
    en: "Weak Spot Review",
    ar: "مراجعة نقاط الضعف",
    desc: "Focus on what you struggled with last time",
    count: 5,
    range: "4–6 questions",
    needsPrior: true,
  },
  { id: "mock_oral", en: "Mock Oral Exam", ar: "محاكاة الامتحان الشفهي", desc: "A full oral-exam simulation", count: 14, range: "12–18 questions" },
];

const COACH_STYLES: { id: PracticeCoachStyle; en: string; ar: string; desc: string; isDefault?: boolean }[] = [
  { id: "gentle", en: "Gentle Coach", ar: "مدرب لطيف", desc: "Warm and encouraging" },
  { id: "normal", en: "Normal Tutor", ar: "معلم عادي", desc: "Balanced — honest but supportive", isDefault: true },
  { id: "strict", en: "Strict Examiner", ar: "ممتحن صارم", desc: "Direct and rigorous" },
];

const ANSWER_LENGTHS: { id: string; en: string; ar: string; seconds: number; hint: string }[] = [
  { id: "short", en: "Short", ar: "قصير", seconds: 60, hint: "~60 sec" },
  { id: "standard", en: "Standard", ar: "قياسي", seconds: 90, hint: "~90 sec" },
  { id: "extended", en: "Extended", ar: "مطوّل", seconds: 120, hint: "~2 min" },
];

const SUBJECTS: { en: string; ar: string }[] = [
  { en: "Engineering", ar: "الهندسة" },
  { en: "Business", ar: "إدارة الأعمال" },
  { en: "Health Sciences", ar: "العلوم الصحية" },
  { en: "Education", ar: "التربية" },
  { en: "Law", ar: "القانون" },
  { en: "General Academic Skills", ar: "المهارات الأكاديمية العامة" },
];

function readinessBand(score: number): { en: string; ar: string; cls: string } {
  if (score >= 80) return { en: "Ready for oral exam", ar: "جاهز للامتحان الشفهي", cls: "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800" };
  if (score >= 65) return { en: "Almost ready", ar: "أوشكت على الجاهزية", cls: "text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800" };
  if (score >= 50) return { en: "Needs targeted practice", ar: "تحتاج إلى تدريب مُركّز", cls: "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800" };
  return { en: "Not ready yet", ar: "لست جاهزًا بعد", cls: "text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800" };
}

const COVERAGE_STYLE: Record<PracticeCoverageStatus, { cls: string; en: string }> = {
  strong: { cls: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 border-green-200 dark:border-green-800", en: "Confident" },
  developing: { cls: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800", en: "Partial" },
  weak: { cls: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800", en: "Weak" },
  not_covered: { cls: "bg-muted text-muted-foreground border-border", en: "Not tested" },
};

// Persistent privacy banner shown throughout the active session.
function PrivacyBanner() {
  return (
    <div
      className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs"
      data-testid="banner-practice-private"
    >
      <Lock className="h-3.5 w-3.5 text-primary flex-shrink-0" />
      <span className="text-primary font-medium">Private practice — not sent to your professor</span>
      <span className="text-muted-foreground" dir="rtl">تدريب خاص — لا يُرسل إلى أستاذك</span>
    </div>
  );
}

function HeardTranscriptCard({
  transcript,
  isOpen,
  onToggle,
}: {
  transcript: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const heard = transcript.trim();
  if (!heard) return null;

  return (
    <div
      className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
      data-testid="card-main-transcript"
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 text-left"
        aria-expanded={isOpen}
        onClick={onToggle}
        data-testid="button-toggle-main-transcript"
      >
        <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <span className="flex-shrink-0 font-medium text-foreground/80">What we heard:</span>
        {!isOpen && <span className="min-w-0 flex-1 truncate">{heard}</span>}
        <ChevronRight className={`ml-auto h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
      </button>
      {isOpen && (
        <p className="mt-2 pl-6 leading-relaxed" data-testid="text-main-transcript">
          {heard}
        </p>
      )}
    </div>
  );
}

async function measureAudioEnergy(blob: Blob): Promise<{ durationMs: number; rmsDbfs: number }> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return { durationMs: 0, rmsDbfs: -Infinity };
  }

  const context = new AudioContextCtor();
  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(buffer);
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const samples = audioBuffer.getChannelData(channel);
      sampleCount += samples.length;
      for (let i = 0; i < samples.length; i += 1) {
        sumSquares += samples[i] * samples[i];
      }
    }

    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    return {
      durationMs: audioBuffer.duration * 1000,
      rmsDbfs: rms > 0 ? 20 * Math.log10(rms) : -Infinity,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

// Self-contained voice recorder. Auto-starts on mount; reports base64 audio on stop.
function VoiceRecorder({
  maxSeconds,
  onRecorded,
  onError,
}: {
  maxSeconds: number;
  onRecorded: (base64: string) => void;
  onError: (message?: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [time, setTime] = useState(0);
  const [denied, setDenied] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef("audio/webm");
  const startedRef = useRef(false);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const blobToBase64 = (blob: Blob): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

    const pickMime = (): string => {
      if (typeof MediaRecorder === "undefined") return "audio/webm";
      const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      for (const t of types) if (MediaRecorder.isTypeSupported(t)) return t;
      return "audio/webm";
    };

    const start = async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      if (typeof navigator === "undefined" || !navigator.mediaDevices || !window.MediaRecorder) {
        setDenied(true);
        onError();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        mimeRef.current = mime;
        let recorder: MediaRecorder;
        try {
          recorder = new MediaRecorder(stream, { mimeType: mime });
        } catch {
          recorder = new MediaRecorder(stream);
          mimeRef.current = recorder.mimeType || "audio/webm";
        }
        mediaRecorderRef.current = recorder;
        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          try {
            const { durationMs, rmsDbfs } = await measureAudioEnergy(blob);
            if (durationMs < MIN_RECORDING_DURATION_MS || rmsDbfs < MIN_RECORDING_RMS_DBFS) {
              onError(UNCLEAR_AUDIO_MESSAGE);
              return;
            }
            const base64 = await blobToBase64(blob);
            onRecorded(base64);
          } catch {
            onError(UNCLEAR_AUDIO_MESSAGE);
          }
        };
        recorder.start();
        setIsRecording(true);
        setTime(0);
        timerRef.current = setInterval(() => {
          setTime((prev) => {
            const next = prev + 1;
            if (next >= maxSeconds) stop();
            return next;
          });
        }, 1000);
      } catch {
        setDenied(true);
        onError();
      }
    };

    start();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stream?.getTracks?.().forEach((t) => t.stop());
        } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (denied) {
    return (
      <div className="p-4 rounded-md bg-muted/50 text-center space-y-1" data-testid="recorder-denied">
        <AlertCircle className="h-6 w-6 mx-auto text-destructive" />
        <p className="text-sm font-medium">Microphone unavailable</p>
        <p className="text-xs text-muted-foreground">Type your answer below instead.</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-md bg-muted/50 text-center space-y-4" data-testid="recorder-active">
      <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
        <Mic className="h-10 w-10 text-destructive" />
      </div>
      <p className="text-2xl font-mono font-medium" data-testid="text-record-time">
        {fmt(time)} <span className="text-sm text-muted-foreground">/ {fmt(maxSeconds)}</span>
      </p>
      <p className="text-sm text-muted-foreground">Recording your answer…</p>
      <Button variant="destructive" size="lg" onClick={stop} disabled={!isRecording} data-testid="button-stop-record">
        <Square className="h-4 w-4 mr-2" />
        Stop &amp; continue
      </Button>
    </div>
  );
}

export function VoxPracticeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("material");

  // Material setup
  const [source, setSource] = useState<PracticeSourceType | null>(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [materialContent, setMaterialContent] = useState("");
  const [materialLabel, setMaterialLabel] = useState("");
  const [summary, setSummary] = useState<MaterialSummary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Session setup
  const [mode, setMode] = useState<PracticeSessionMode>("readiness_sprint");
  const [coach, setCoach] = useState<PracticeCoachStyle>("normal");
  const [answerLen, setAnswerLen] = useState("standard");
  const [generating, setGenerating] = useState(false);
  const [hasPrior, setHasPrior] = useState(false);

  // Loop
  const [session, setSession] = useState<PracticeSession | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [loopStep, setLoopStep] = useState<LoopStep>("prep");
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [recorderKey, setRecorderKey] = useState(0);
  const [showRecorder, setShowRecorder] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [processingLabel, setProcessingLabel] = useState("");
  const [mainTranscript, setMainTranscript] = useState("");
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);
  const [probe, setProbe] = useState("");
  const [probeTyped, setProbeTyped] = useState("");
  const [feedback, setFeedback] = useState<CurrentFeedback | null>(null);

  // Report
  const [report, setReport] = useState<PracticeSession | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  const answerSeconds = ANSWER_LENGTHS.find((a) => a.id === answerLen)?.seconds ?? 90;

  const resetAll = useCallback(() => {
    setPhase("material");
    setSource(null);
    setSubject("");
    setTopic("");
    setMaterialContent("");
    setMaterialLabel("");
    setSummary(null);
    setAnalyzing(false);
    setUploadName("");
    setMode("readiness_sprint");
    setCoach("normal");
    setAnswerLen("standard");
    setGenerating(false);
    setSession(null);
    setQuestions([]);
    setQIndex(0);
    setLoopStep("prep");
    setPrepLeft(PREP_SECONDS);
    setShowRecorder(false);
    setTypedAnswer("");
    setMainTranscript("");
    setIsTranscriptOpen(true);
    setProbe("");
    setProbeTyped("");
    setFeedback(null);
    setReport(null);
    setFinalizing(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetAll();
    }
  }, [open, resetAll]);

  // Detect whether the student has a prior completed session (gates Weak Spot Review).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/practice/sessions", { credentials: "include" });
        if (!res.ok) return;
        const list = (await res.json()) as PracticeSession[];
        if (!cancelled) setHasPrior(Array.isArray(list) && list.some((s) => !!s.completedAt));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Prep countdown
  useEffect(() => {
    if (phase !== "loop" || loopStep !== "prep") return;
    setPrepLeft(PREP_SECONDS);
    const id = setInterval(() => {
      setPrepLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          setLoopStep("record_main");
          setShowRecorder(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, loopStep, qIndex]);

  // ---- API helpers ----
  const transcribe = async (base64: string, questionText: string): Promise<string> => {
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ audioData: base64, questionText }),
      });
      const data = await res.json();
      return typeof data?.transcript === "string" ? data.transcript : "";
    } catch {
      return "";
    }
  };

  // ---- Material setup ----
  const handleFile = async (file: File) => {
    setUploadName(file.name);
    setAnalyzing(true);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "upload");
      const res = await fetch("/api/practice/extract-material", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!res.ok || !data?.content) {
        throw new Error(data?.error || "Could not read this file.");
      }
      setMaterialContent(data.content);
      setMaterialLabel(file.name);
      await analyze(data.content, file.name);
    } catch (e: any) {
      setAnalyzing(false);
      toast({ title: "Upload failed", description: e.message || "Could not read this file.", variant: "destructive" });
    }
  };

  const analyze = async (content: string, label: string) => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/practice/analyze-material", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      const data = (await res.json()) as MaterialSummary;
      if (!res.ok) throw new Error((data as any)?.error || "Could not analyze material.");
      setSummary(data);
      setMaterialContent(content);
      setMaterialLabel(label);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message || "Please try again.", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const startSubject = async (s: { en: string; ar: string }) => {
    setSource("subject");
    setSubject(s.en);
    const content = `Subject area: ${s.en}. Generate university-level oral exam practice covering the core concepts, methods, and debates a student in ${s.en} should be able to discuss aloud.`;
    await analyze(content, s.en);
  };

  const startTopic = async () => {
    if (!topic.trim()) return;
    setSource("topic");
    const content = `Topic for oral practice: ${topic.trim()}. The student wants to practice answering university-level oral exam questions on this topic.`;
    await analyze(content, topic.trim());
  };

  // ---- Session setup -> create + generate ----
  const beginSession = async (overrideMode?: PracticeSessionMode, focusConcepts?: string[]) => {
    const useMode = overrideMode ?? mode;
    const modeMeta = MODES.find((m) => m.id === useMode)!;
    setGenerating(true);
    try {
      const createRes = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sourceType: source ?? "topic",
          sourceSummary: summary?.summary?.slice(0, 280) || materialLabel,
          sessionMode: useMode,
          coachStyle: coach,
        }),
      });
      const created = (await createRes.json()) as PracticeSession;
      if (!createRes.ok) throw new Error((created as any)?.error || "Could not start session.");

      const genRes = await fetch(`/api/practice/sessions/${created.id}/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          materialContent,
          count: modeMeta.count,
          focusConcepts: focusConcepts && focusConcepts.length ? focusConcepts : undefined,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData?.error || "Could not generate questions.");
      const qs = (genData.questions || []) as PracticeQuestion[];
      if (!qs.length) throw new Error("No questions could be generated from this material. Try different material.");

      setSession(created);
      setQuestions(qs);
      setMode(useMode);
      setQIndex(0);
      resetQuestionState();

      setPhase("consent");
      setLoopStep("prep");
    } catch (e: any) {
      toast({ title: "Could not start", description: e.message || "Please try again.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const acceptConsent = async () => {
    if (!session) {
      setPhase("session");
      return;
    }
    try {
      const res = await fetch(`/api/practice/sessions/${session.id}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ consentGiven: true, consentTimestamp: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not record consent.");
      setSession(data.session || data);
      setPhase("loop");
      setLoopStep("prep");
    } catch (e: any) {
      toast({ title: "Consent not recorded", description: e.message || "Please try again.", variant: "destructive" });
    }
  };

  // ---- Loop helpers ----
  const resetQuestionState = () => {
    setLoopStep("prep");
    setPrepLeft(PREP_SECONDS);
    setShowRecorder(false);
    setTypedAnswer("");
    setMainTranscript("");
    setProbe("");
    setProbeTyped("");
    setFeedback(null);
    setRecorderKey((k) => k + 1);
  };

  const currentQuestion = questions[qIndex];

  const retryMainRecording = () => {
    setLoopStep("record_main");
    setRecorderKey((k) => k + 1);
    setShowRecorder(true);
  };

  const handleMainRecorded = async (base64: string) => {
    setShowRecorder(false);
    setLoopStep("processing");
    setProcessingLabel("Transcribing your answer…");
    const t = await transcribe(base64, currentQuestion?.text || "");
    if (!t.trim()) {
      toast({ title: "No speech detected", description: "Please record again or type your answer.", variant: "destructive" });
      retryMainRecording();
      return;
    }
    if (t.trim().length < MIN_CLEAR_ANSWER_CHARS) {
      toast({ title: UNCLEAR_AUDIO_MESSAGE, variant: "destructive" });
      retryMainRecording();
      return;
    }
    await submitMainAnswer(t);
  };

  const submitMainAnswer = async (transcript: string) => {
    if (!session || !currentQuestion) return;
    setMainTranscript(transcript);
    setIsTranscriptOpen(true);
    setLoopStep("processing");
    setProcessingLabel("Thinking of a follow-up…");
    try {
      const res = await fetch(`/api/practice/sessions/${session.id}/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questionId: currentQuestion.id, transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not generate a follow-up.");
      setProbe(data.probe || "");
      setLoopStep("probe");
      setShowRecorder(false);
      setRecorderKey((k) => k + 1);
    } catch (e: any) {
      // If probe fails, skip straight to feedback on the main answer.
      await submitForFeedback(transcript, "");
    }
  };

  const handleProbeRecorded = async (base64: string) => {
    setShowRecorder(false);
    setLoopStep("processing");
    setProcessingLabel("Transcribing your answer…");
    const t = await transcribe(base64, probe);
    await submitForFeedback(mainTranscript, t);
  };

  const submitForFeedback = async (main: string, probeAnswer: string) => {
    if (!session || !currentQuestion) return;
    setLoopStep("processing");
    setProcessingLabel("Scoring your answer privately…");
    const combined = probeAnswer.trim() ? `${main}\n\nFollow-up answer: ${probeAnswer.trim()}` : main;
    const skippedProbe = !probeAnswer.trim();
    try {
      const res = await fetch(`/api/practice/sessions/${session.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ questionId: currentQuestion.id, transcript: combined, materialContent, skippedProbe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not score this answer.");
      const fb: CurrentFeedback = { microFeedback: data.microFeedback || "", voxScoreProfile: data.voxScoreProfile };
      setFeedback(fb);
      setQuestions((prev) =>
        prev.map((q, i) =>
          i === qIndex
            ? { ...q, transcript: main, followUpProbe: probe, followUpTranscript: probeAnswer, microFeedback: fb.microFeedback, voxScoreProfile: fb.voxScoreProfile }
            : q,
        ),
      );
      setLoopStep("feedback");
    } catch (e: any) {
      toast({ title: "Scoring failed", description: e.message || "Moving on.", variant: "destructive" });
      setLoopStep("feedback");
      setFeedback(null);
    }
  };

  const skipProbe = () => {
    submitForFeedback(mainTranscript, "");
  };

  const skipQuestion = () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1);
      resetQuestionState();
    } else {
      finalize();
    }
  };

  const nextQuestion = () => {
    if (qIndex + 1 < questions.length) {
      setQIndex((i) => i + 1);
      resetQuestionState();
    } else {
      finalize();
    }
  };

  const retryQuestion = () => {
    resetQuestionState();
  };

  const finalize = async () => {
    if (!session) return;
    setFinalizing(true);
    setPhase("report");
    try {
      const res = await fetch(`/api/practice/sessions/${session.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as PracticeSession;
      if (!res.ok) throw new Error((data as any)?.error || "Could not build your report.");
      setReport(data);
      setHasPrior(true);
    } catch (e: any) {
      toast({ title: "Report failed", description: e.message || "Please try again.", variant: "destructive" });
    } finally {
      setFinalizing(false);
    }
  };

  // Restart a fresh weak-spot review pre-seeded with the weakest concepts.
  const startWeakSpotReview = () => {
    const map = (report?.conceptCoverageMap || {}) as Record<string, PracticeCoverageStatus>;
    const weakest = Object.entries(map)
      .filter(([, status]) => status === "weak" || status === "developing")
      .sort((a, b) => (a[1] === "weak" ? -1 : 1) - (b[1] === "weak" ? -1 : 1))
      .map(([concept]) => concept);
    setReport(null);
    setSession(null);
    setQuestions([]);
    beginSession("weak_spot", weakest);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const renderMaterial = () => (
    <div className="space-y-4" data-testid="phase-material">
      <div>
        <h3 className="font-semibold text-lg">Choose your study material</h3>
        <p className="text-sm text-muted-foreground" dir="rtl">اختر مادتك الدراسية</p>
      </div>

      {!summary && (
        <div className="grid md:grid-cols-3 gap-3">
          <Card
            className={`cursor-pointer hover-elevate ${source === "upload" ? "border-primary" : ""}`}
            onClick={() => {
              setSource("upload");
              fileInputRef.current?.click();
            }}
            data-testid="card-source-upload"
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-[10px] font-medium rounded-full bg-primary/10 text-primary px-2 py-0.5">Recommended</span>
              </div>
              <p className="font-medium text-sm">Upload a file</p>
              <p className="text-xs text-muted-foreground">PDF, including scanned pages</p>
              <p className="text-xs text-muted-foreground">Most relevant to your coursework</p>
            </CardContent>
          </Card>

          <Card className={`${source === "subject" ? "border-primary" : ""}`} data-testid="card-source-subject">
            <CardContent className="p-4 space-y-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <p className="font-medium text-sm">Choose a subject</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUBJECTS.map((s) => (
                  <button
                    key={s.en}
                    type="button"
                    onClick={() => startSubject(s)}
                    className="text-[11px] rounded-full border px-2 py-0.5 hover-elevate"
                    data-testid={`button-subject-${s.en.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {s.en}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className={`${source === "topic" ? "border-primary" : ""}`} data-testid="card-source-topic">
            <CardContent className="p-4 space-y-2">
              <PenLine className="h-6 w-6 text-primary" />
              <p className="font-medium text-sm">Type a topic</p>
              <Textarea
                placeholder="e.g. Newton's laws of motion"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                data-testid="input-topic"
              />
              <Button size="sm" className="w-full" onClick={startTopic} disabled={!topic.trim() || analyzing} data-testid="button-topic-continue">
                Continue
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
        data-testid="input-file"
      />

      {analyzing && (
        <div className="flex items-center gap-3 rounded-md border p-4" data-testid="status-analyzing">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="text-sm font-medium">Reading your material…</p>
            {uploadName && <p className="text-xs text-muted-foreground">{uploadName}</p>}
          </div>
        </div>
      )}

      {summary && !analyzing && (
        <Card className="border-primary/30" data-testid="card-material-summary">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <p className="font-medium text-sm">{materialLabel}</p>
            </div>
            {summary.summary && <p className="text-sm text-muted-foreground">{summary.summary}</p>}
            <p className="text-sm font-medium" data-testid="text-summary-stats">
              Found {summary.concepts.length} key concept{summary.concepts.length !== 1 ? "s" : ""} and {summary.sampleQuestions.length} possible oral question
              {summary.sampleQuestions.length !== 1 ? "s" : ""} across {summary.topics.length} topic{summary.topics.length !== 1 ? "s" : ""}.
            </p>
            {summary.concepts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.concepts.slice(0, 10).map((c) => (
                  <span key={c} className="text-[11px] rounded-full bg-muted px-2 py-0.5">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSummary(null);
                  setSource(null);
                  setUploadName("");
                }}
                data-testid="button-change-material"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Change
              </Button>
              <Button size="sm" onClick={() => setPhase("session")} data-testid="button-to-session-setup">
                Continue
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const renderSession = () => (
    <div className="space-y-5" data-testid="phase-session">
      <div>
        <h3 className="font-semibold text-lg">Set up your practice session</h3>
        <p className="text-sm text-muted-foreground" dir="rtl">إعداد جلسة التدريب</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Session type <span className="text-muted-foreground" dir="rtl">نوع الجلسة</span></p>
        <div className="grid md:grid-cols-2 gap-2">
          {MODES.map((m) => {
            const disabled = m.needsPrior && !hasPrior;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => setMode(m.id)}
                className={`text-left rounded-md border p-3 ${mode === m.id ? "border-primary bg-primary/5" : ""} ${disabled ? "opacity-50 cursor-not-allowed" : "hover-elevate"}`}
                data-testid={`card-mode-${m.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{m.en}</span>
                  {m.isDefault && <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">Default</span>}
                </div>
                <p className="text-xs text-muted-foreground" dir="rtl">{m.ar}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.desc} · {m.range}</p>
                {disabled && <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">Unlocks after your first session</p>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Coach style <span className="text-muted-foreground" dir="rtl">أسلوب المدرب</span></p>
        <div className="grid grid-cols-3 gap-2">
          {COACH_STYLES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCoach(c.id)}
              className={`text-left rounded-md border p-3 ${coach === c.id ? "border-primary bg-primary/5" : "hover-elevate"}`}
              data-testid={`card-coach-${c.id}`}
            >
              <span className="font-medium text-sm">{c.en}</span>
              <p className="text-xs text-muted-foreground" dir="rtl">{c.ar}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Answer length <span className="text-muted-foreground" dir="rtl">طول الإجابة</span></p>
        <div className="grid grid-cols-3 gap-2">
          {ANSWER_LENGTHS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAnswerLen(a.id)}
              className={`rounded-md border p-3 text-center ${answerLen === a.id ? "border-primary bg-primary/5" : "hover-elevate"}`}
              data-testid={`card-length-${a.id}`}
            >
              <span className="font-medium text-sm">{a.en}</span>
              <p className="text-xs text-muted-foreground" dir="rtl">{a.ar}</p>
              <p className="text-xs text-muted-foreground mt-1">{a.hint}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={() => setPhase("material")} data-testid="button-back-to-material">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button onClick={() => beginSession()} disabled={generating} data-testid="button-start-practice">
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          {generating ? "Preparing questions…" : "Start practicing"}
        </Button>
      </div>
    </div>
  );

  const renderLoop = () => {
    const total = questions.length;
    const q = currentQuestion;
    if (!q) return null;
    return (
      <div className="space-y-4" data-testid="phase-loop">
        <PrivacyBanner />
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="text-question-progress">Question {qIndex + 1} of {total}</span>
            <span className="capitalize">{q.cognitiveLevel}</span>
          </div>
          <Progress value={((qIndex + (loopStep === "feedback" ? 1 : 0)) / total) * 100} />
        </div>

        <Card>
          <CardContent className="p-4 space-y-2">
            {q.concept && <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{q.concept}</p>}
            <p className="font-medium" data-testid="text-current-question">{q.text}</p>
          </CardContent>
        </Card>

        {mainTranscript.trim() && (loopStep === "processing" || loopStep === "probe") && (
          <HeardTranscriptCard
            transcript={mainTranscript}
            isOpen={isTranscriptOpen}
            onToggle={() => setIsTranscriptOpen((open) => !open)}
          />
        )}

        {loopStep === "prep" && (
          <div className="rounded-md border p-6 text-center space-y-3" data-testid="step-prep">
            <Clock className="h-8 w-8 mx-auto text-primary" />
            <p className="text-4xl font-mono font-bold" data-testid="text-prep-countdown">{prepLeft}</p>
            <p className="text-sm text-muted-foreground">Take a moment to think. Recording starts automatically.</p>
            <p className="text-xs text-muted-foreground">Structure tip: Claim → Reason → Example → Conclusion</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoopStep("record_main");
                setShowRecorder(true);
              }}
              data-testid="button-start-now"
            >
              Start now
            </Button>
          </div>
        )}

        {loopStep === "record_main" && (
          <div className="space-y-3" data-testid="step-record-main">
            {showRecorder && (
              <VoiceRecorder
                key={`main-${recorderKey}`}
                maxSeconds={answerSeconds}
                onRecorded={handleMainRecorded}
                onError={(message) => {
                  if (message) {
                    toast({ title: message, variant: "destructive" });
                    retryMainRecording();
                    return;
                  }
                  setShowRecorder(false);
                }}
              />
            )}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or type your answer instead:</p>
              <Textarea
                placeholder="Type your answer…"
                value={typedAnswer}
                onChange={(e) => setTypedAnswer(e.target.value)}
                rows={3}
                data-testid="input-typed-answer"
              />
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={skipQuestion} data-testid="button-skip-question">
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip question
                </Button>
                <Button size="sm" onClick={() => submitMainAnswer(typedAnswer.trim())} disabled={!typedAnswer.trim()} data-testid="button-submit-typed">
                  Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {loopStep === "processing" && (
          <div className="rounded-md border p-8 text-center space-y-3" data-testid="step-processing">
            <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{processingLabel}</p>
          </div>
        )}

        {loopStep === "probe" && (
          <div className="space-y-3" data-testid="step-probe">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-1">
                <p className="text-[11px] uppercase tracking-wide text-primary">Follow-up</p>
                <p className="font-medium" data-testid="text-probe">{probe}</p>
              </CardContent>
            </Card>
            {showRecorder ? (
              <VoiceRecorder
                key={`probe-${recorderKey}`}
                maxSeconds={answerSeconds}
                onRecorded={handleProbeRecorded}
                onError={(message) => {
                  setShowRecorder(false);
                  if (message) toast({ title: message, variant: "destructive" });
                }}
              />
            ) : (
              <Button className="w-full" onClick={() => setShowRecorder(true)} data-testid="button-record-probe">
                <Mic className="h-4 w-4 mr-2" />
                Record your answer
              </Button>
            )}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or type your answer instead:</p>
              <Textarea
                placeholder="Type your follow-up answer…"
                value={probeTyped}
                onChange={(e) => setProbeTyped(e.target.value)}
                rows={2}
                data-testid="input-probe-answer"
              />
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={skipProbe} data-testid="button-skip-probe">
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip follow-up
                </Button>
                <Button
                  size="sm"
                  onClick={() => submitForFeedback(mainTranscript, probeTyped.trim())}
                  disabled={!probeTyped.trim()}
                  data-testid="button-submit-probe"
                >
                  Continue
                </Button>
              </div>
            </div>
          </div>
        )}

        {loopStep === "feedback" && (
          <div className="space-y-3" data-testid="step-feedback">
            {feedback ? <MicroFeedbackCard feedback={feedback} /> : <p className="text-sm text-muted-foreground">No feedback available for this answer.</p>}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={retryQuestion} data-testid="button-retry-question">
                <RotateCcw className="h-4 w-4 mr-1" />
                Retry
              </Button>
              <Button onClick={nextQuestion} data-testid="button-next-question">
                {qIndex + 1 < total ? "Next question" : "See my report"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderReport = () => {
    if (finalizing || !report) {
      return (
        <div className="rounded-md border p-10 text-center space-y-3" data-testid="status-finalizing">
          <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Building your readiness report…</p>
        </div>
      );
    }

    const score = report.overallReadinessScore ?? 0;
    const band = readinessBand(score);
    const profile = report.overallVoxScoreProfile;
    const coverage = (report.conceptCoverageMap || {}) as Record<string, PracticeCoverageStatus>;
    const allConcepts = summary?.concepts || [];
    const notTested = allConcepts.filter((c) => !(c in coverage));

    const answered = questions.filter((q) => q.voxScoreProfile);
    const sorted = [...answered].sort((a, b) => (b.voxScoreProfile!.totalScore || 0) - (a.voxScoreProfile!.totalScore || 0));
    const best = sorted[0];
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : undefined;

    const fixes = profile ? voxWeakest(profile.dimensions, 3) : [];
    const evidenceFor = (dim: string) => {
      for (const q of answered) {
        const d = q.voxScoreProfile?.dimensions.find((x) => x.dimension === dim);
        if (d?.evidence) return d.evidence;
      }
      return "";
    };

    const hasWeakConcepts = Object.values(coverage).some((s) => s === "weak" || s === "developing");

    return (
      <div className="space-y-5" data-testid="phase-report">
        <PrivacyBanner />

        {/* Section 1 — readiness band */}
        <Card className={`border ${band.cls}`} data-testid="report-readiness">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold" data-testid="text-readiness-band">{band.en}</p>
                <p className="text-sm" dir="rtl">{band.ar}</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-bold" data-testid="text-readiness-score">{Math.round(score)}</span>
                <span className="text-sm text-muted-foreground">/100</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pt-1">This is a practice estimate — not an official grade.</p>
          </CardContent>
        </Card>

        {/* Section 2 — VoxScore breakdown */}
        <div data-testid="report-voxscore">
          <p className="text-xs font-medium text-muted-foreground mb-2">Practice VoxScore — private estimate</p>
          {profile ? (
            <StudentVoxScore profile={profile} />
          ) : (
            <p className="text-sm text-muted-foreground">Answer at least one question to see your VoxScore.</p>
          )}
        </div>

        {/* Section 3 — concept coverage */}
        <div className="space-y-2" data-testid="report-coverage">
          <p className="text-sm font-medium">Concept coverage</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(coverage).map(([concept, status]) => (
              <span
                key={concept}
                className={`text-[11px] rounded-full border px-2 py-0.5 ${COVERAGE_STYLE[status].cls}`}
                data-testid={`pill-concept-${concept.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {concept} · {COVERAGE_STYLE[status].en}
              </span>
            ))}
            {notTested.map((concept) => (
              <span
                key={concept}
                className={`text-[11px] rounded-full border px-2 py-0.5 ${COVERAGE_STYLE.not_covered.cls}`}
                data-testid={`pill-concept-${concept.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {concept} · Not tested
              </span>
            ))}
            {Object.keys(coverage).length === 0 && notTested.length === 0 && (
              <p className="text-sm text-muted-foreground">No concept data for this session.</p>
            )}
          </div>
        </div>

        {/* Section 4 — best & worst excerpts */}
        {(best || worst) && (
          <div className="grid md:grid-cols-2 gap-3" data-testid="report-excerpts">
            {best && (
              <Card className="border-green-200 dark:border-green-800">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5" /> Your best answer
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{best.text}</p>
                  <p className="text-sm line-clamp-4" data-testid="text-best-excerpt">{best.transcript}</p>
                </CardContent>
              </Card>
            )}
            {worst && (
              <Card className="border-amber-200 dark:border-amber-800">
                <CardContent className="p-3 space-y-1">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" /> Needs the most work
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{worst.text}</p>
                  <p className="text-sm line-clamp-4" data-testid="text-worst-excerpt">{worst.transcript}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Section 5 — top fixes */}
        {fixes.length > 0 && (
          <div className="space-y-2" data-testid="report-fixes">
            <p className="text-sm font-medium flex items-center gap-1">
              <Lightbulb className="h-4 w-4 text-primary" /> Top 3 fixes
            </p>
            <ol className="space-y-1.5">
              {fixes.map((d, i) => (
                <li key={d.dimension} className="flex gap-2 text-sm" data-testid={`fix-${i}`}>
                  <span className="font-medium text-primary">{i + 1}.</span>
                  <span>
                    <strong>{voxFriendlyName(d.dimension)}:</strong> {evidenceFor(d.dimension) || "Strengthen this dimension with more specific, well-structured answers."}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Section 6 — weak spot review CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t pt-4">
          <Button
            onClick={startWeakSpotReview}
            disabled={!hasWeakConcepts || generating}
            data-testid="button-weak-spot-review"
          >
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Target className="h-4 w-4 mr-2" />}
            Start 7-minute weak spot review
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-finish-practice">
            Done
          </Button>
        </div>
      </div>
    );
  };

  if (phase === "consent") {
    return (
      <VoiceConsentDialog
        open={open}
        onConsent={acceptConsent}
        onDecline={() => onOpenChange(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-voxpractice">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-primary" />
            VoxPractice
          </DialogTitle>
          <DialogDescription>
            Private oral-exam practice · {" "}
            <span dir="rtl">تدريب خاص على الامتحان الشفهي</span>
          </DialogDescription>
        </DialogHeader>

        {phase === "material" && renderMaterial()}
        {phase === "session" && renderSession()}
        {phase === "loop" && renderLoop()}
        {phase === "report" && renderReport()}
      </DialogContent>
    </Dialog>
  );
}

// Micro-feedback card: one strength + one missing point derived from the profile.
function MicroFeedbackCard({ feedback }: { feedback: CurrentFeedback }) {
  const { microFeedback, voxScoreProfile } = feedback;
  const dims = voxScoreProfile?.dimensions || [];
  const scoredDims = dims.filter((d) => typeof d.band === "number" && typeof d.weightedScore === "number");
  const strongest = [...scoredDims].sort((a, b) => b.band - a.band)[0];
  const weakest = [...scoredDims].sort((a, b) => a.band - b.band)[0];
  const missingConcept = dims.flatMap((d) => d.conceptsMissing || [])[0];
  const total = Math.round(voxScoreProfile?.totalScore ?? 0);
  const lowScore = total < 50;

  return (
    <Card data-testid="card-micro-feedback">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Practice estimate (private)</span>
          <span className="text-lg font-bold" data-testid="text-feedback-score">{total}/100</span>
        </div>
        {microFeedback && <p className="text-sm">{microFeedback}</p>}
        {strongest && (
          <div className="flex items-start gap-2 rounded-md bg-green-50 dark:bg-green-950/30 p-2" data-testid="feedback-strength">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs">
              <strong>Strength:</strong> {voxFriendlyName(strongest.dimension)}
              {strongest.evidence ? ` — ${strongest.evidence}` : ""}
            </p>
          </div>
        )}
        {(missingConcept || weakest) && (
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 p-2" data-testid="feedback-missing">
            <Target className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs">
              <strong>Missing:</strong>{" "}
              {missingConcept
                ? missingConcept
                : `${voxFriendlyName(weakest.dimension)}${weakest.evidence ? ` — ${weakest.evidence}` : ""}`}
            </p>
          </div>
        )}
        {lowScore && (
          <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="text-retry-prompt">
            Tip: this answer scored low — a retry could help you lock it in.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
