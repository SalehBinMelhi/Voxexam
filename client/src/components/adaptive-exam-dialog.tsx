import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Mic,
  Square,
  RotateCcw,
  Send,
  Sparkles,
  CheckCircle2,
  Loader2,
  Award,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface AdaptiveExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId: string;
  attemptId?: string;
}

interface AdaptiveDiagnosticReport {
  finalScore: number;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

function parseImmediateDiagnosticReport(value: unknown): AdaptiveDiagnosticReport | null {
  if (!value || typeof value !== "object") return null;

  const report = value as Record<string, unknown>;
  if (typeof report.finalScore !== "number" || !Number.isFinite(report.finalScore)) return null;

  const stringItems = (items: unknown): string[] =>
    Array.isArray(items)
      ? items.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];

  return {
    finalScore: Math.max(0, Math.min(100, report.finalScore)),
    strengths: stringItems(report.strengths),
    weaknesses: stringItems(report.weaknesses),
    recommendations: stringItems(report.recommendations),
  };
}

export function AdaptiveExamDialog({
  open,
  onOpenChange,
  examId,
  attemptId: providedAttemptId,
}: AdaptiveExamDialogProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<"loading" | "mic_check" | "active" | "completed">("loading");

  // Exam state
  const [examData, setExamData] = useState<any>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(providedAttemptId || null);
  const [currentQuestion, setCurrentQuestion] = useState<string>("");
  const [questionNumber, setQuestionNumber] = useState<number>(1);
  const [totalQuestions, setTotalQuestions] = useState<number>(10);
  const [conceptTitle, setConceptTitle] = useState<string>("");

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [textFallback, setTextFallback] = useState<string>("");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isStartingAttempt, setIsStartingAttempt] = useState(false);

  // Diagnostic Report State
  const [finalReport, setFinalReport] = useState<AdaptiveDiagnosticReport | null>(null);

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mic test audio ref
  const [micTestPassed, setMicTestPassed] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("loading");
      setExamData(null);
      setActiveAttemptId(providedAttemptId || null);
      setCurrentQuestion("");
      setFinalReport(null);
      setAudioBlob(null);
      setAudioUrl(null);
      setTextFallback("");
      setMicTestPassed(false);
      setIsStartingAttempt(false);
      return;
    }
    setStep("loading");
    void loadExamById(examId);
  }, [open, examId, providedAttemptId]);

  useEffect(() => {
    return () => {
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const stopTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const loadExamById = async (id: string) => {
    try {
      const res = await fetch(`/api/student/exams/${encodeURIComponent(id)}`, { credentials: "include" });
      const payload = await res.json();
      if (!res.ok) {
        toast({ title: "Exam unavailable", description: payload.error || "This exam cannot be opened.", variant: "destructive" });
        onOpenChange(false);
        return;
      }
      const data = payload.data;
      if (!data?.exam || data.exam.mode !== "adaptive") {
        toast({ title: "Exam unavailable", description: "This is not an adaptive exam.", variant: "destructive" });
        onOpenChange(false);
        return;
      }
      setExamData({ ...data.exam, examId: data.exam.id });
      setActiveAttemptId(data.attemptId || providedAttemptId || null);
      setStep("mic_check");
    } catch {
      toast({ title: "Exam unavailable", description: "Connection error. Please try again.", variant: "destructive" });
      onOpenChange(false);
    }
  };

  const startMicTest = async () => {
    try {
      setIsTestingMic(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setMicTestPassed(true);
      toast({ title: "Microphone Ready", description: "Audio device detected successfully!" });
    } catch (err) {
      setMicTestPassed(false);
      toast({ title: "Microphone Access Denied", description: "Please enable microphone permissions in your browser.", variant: "destructive" });
    } finally {
      setIsTestingMic(false);
    }
  };

  const startExamAttempt = async () => {
    const selectedExamId = examData?.id || examData?.examId;
    if (!selectedExamId || isStartingAttempt) return;
    try {
      setIsStartingAttempt(true);
      const res = await fetch("/api/adaptive-attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ examId: selectedExamId, attemptId: activeAttemptId || undefined }),
      });
      const payload = await res.json();
      if (!res.ok) {
        toast({ title: "Exam Start Error", description: payload.error || "Could not start exam", variant: "destructive" });
        return;
      }
      const data = payload.data || payload;
      setActiveAttemptId(data.attemptId);
      setCurrentQuestion(data.currentQuestion);
      setQuestionNumber(data.questionNumber || 1);
      setTotalQuestions(data.totalQuestions || 10);
      setConceptTitle(data.conceptTitle || "");
      setStep("active");
    } catch (err) {
      toast({ title: "Error", description: "Failed to start exam", variant: "destructive" });
    } finally {
      setIsStartingAttempt(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      toast({ title: "Recording Error", description: "Could not access microphone", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      stopTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const resetRecording = () => {
    stopRecording();
    setAudioBlob(null);
    setAudioUrl(null);
    setTextFallback("");
    setRecordingSeconds(0);
  };

  const submitAnswer = async () => {
    if (!activeAttemptId) return;
    if (!audioBlob && !textFallback.trim()) {
      toast({ title: "No Answer Provided", description: "Please record an audio response or type your answer before submitting.", variant: "destructive" });
      return;
    }

    try {
      setIsEvaluating(true);
      const formData = new FormData();
      if (audioBlob) {
        formData.append("audio", audioBlob, "answer.webm");
      }
      if (textFallback.trim()) {
        formData.append("transcriptText", textFallback.trim());
      }

      const res = await fetch(`/api/adaptive-attempts/${activeAttemptId}/answer`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await res.json();
      if (!res.ok) {
        toast({ title: "Evaluation Failed", description: payload.error || "Evaluation failed", variant: "destructive" });
        setIsEvaluating(false);
        return;
      }
      const data = payload.data || payload;

      resetRecording();

      if (data.isFinished) {
        // The server only includes `report` when the professor enabled immediate
        // diagnostic feedback. Its score is preliminary and never an official result.
        setFinalReport(parseImmediateDiagnosticReport(data.report));
        queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
        setStep("completed");
      } else {
        setCurrentQuestion(data.nextQuestion);
        setQuestionNumber(data.questionNumber);
        setTotalQuestions(data.totalQuestions);
        if (data.conceptTitle) setConceptTitle(data.conceptTitle);
        toast({ title: "Answer Evaluated", description: "Gemini adapted the next question based on your response." });
      }
    } catch (err: any) {
      toast({ title: "Submission Error", description: "Network error submitting answer. You can retry.", variant: "destructive" });
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Adaptive Oral Examination (Google Gemini)
          </DialogTitle>
          <DialogDescription>
            Dynamic oral assessment that adapts questions to your exact level of understanding.
          </DialogDescription>
        </DialogHeader>

        {/* Access codes are validated on the authenticated dashboard before this dialog opens. */}
        {step === "loading" && (
          <div
            className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border bg-muted/30 py-4 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
            <div>
              <p className="font-medium">Loading your exam</p>
              <p className="text-sm text-muted-foreground">Checking access, schedule, and attempt status.</p>
            </div>
          </div>
        )}

        {/* STEP 2: MIC CHECK & EXAM INFO */}
        {step === "mic_check" && examData && (
          <div className="space-y-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">{examData.title}</CardTitle>
                <CardDescription>{examData.subjectName || "Oral Assessment"} • {examData.durationMinutes} Minutes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {examData.description && (
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">{examData.description}</p>
                )}

                <div className="border rounded-md p-4 space-y-3 bg-card">
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Mic className="h-4 w-4 text-primary" />
                    Microphone Hardware Test
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Test your microphone before starting the oral exam to ensure Gemini can transcribe your speech clearly.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button variant={micTestPassed ? "outline" : "default"} size="sm" onClick={startMicTest} disabled={isTestingMic}>
                      {isTestingMic ? "Testing..." : micTestPassed ? "Re-test Microphone" : "Start Mic Test"}
                    </Button>
                    {micTestPassed && (
                      <Badge variant="default" className="bg-emerald-600 gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mic Ready
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isStartingAttempt}>Cancel</Button>
              <Button onClick={startExamAttempt} disabled={!micTestPassed || isStartingAttempt}>
                {isStartingAttempt && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {isStartingAttempt ? "Starting exam..." : "Start Adaptive Oral Exam"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: ACTIVE ADAPTIVE EXAM */}
        {step === "active" && (
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Question {questionNumber} of {totalQuestions}</span>
                <span>Concept: {conceptTitle || "Core Assessment"}</span>
              </div>
              <Progress value={(questionNumber / totalQuestions) * 100} className="h-2" />
            </div>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-3">
                <Badge variant="outline" className="w-fit mb-1 gap-1 text-primary">
                  <Sparkles className="h-3 w-3" /> Question {questionNumber}
                </Badge>
                <CardTitle className="text-lg leading-relaxed">{currentQuestion}</CardTitle>
              </CardHeader>
            </Card>

            {/* MICROPHONE RECORDING CONTROLS */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary" /> Your Voice Answer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-center gap-4 py-4 bg-muted/50 rounded-lg border border-dashed">
                  {!isRecording && !audioUrl && (
                    <Button size="lg" className="rounded-full gap-2 px-6" onClick={startRecording} disabled={isEvaluating}>
                      <Mic className="h-5 w-5" /> Start Recording Answer
                    </Button>
                  )}

                  {isRecording && (
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-red-500 animate-pulse font-mono text-lg">
                        <span className="h-3 w-3 rounded-full bg-red-500 inline-block" />
                        {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, "0")}
                      </div>
                      <Button variant="destructive" size="lg" className="rounded-full gap-2" onClick={stopRecording}>
                        <Square className="h-4 w-4" /> Stop Recording
                      </Button>
                    </div>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="flex flex-col items-center gap-3 w-full px-4">
                      <audio src={audioUrl} controls className="w-full max-w-md h-10" />
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={resetRecording} disabled={isEvaluating}>
                          <RotateCcw className="h-4 w-4 mr-1" /> Re-record
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground font-medium">Or type additional notes / backup text answer:</label>
                  <Textarea
                    placeholder="Type backup response or notes..."
                    value={textFallback}
                    onChange={(e) => setTextFallback(e.target.value)}
                    rows={2}
                    disabled={isEvaluating}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={submitAnswer}
                disabled={isEvaluating || isRecording || (!audioBlob && !textFallback.trim())}
                className="gap-2 px-8"
              >
                {isEvaluating ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Gemini Evaluating Answer...
                  </>
                ) : (
                  <>
                    Submit Answer <Send className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4A: IMMEDIATE DIAGNOSTIC REPORT — never the official published result. */}
        {step === "completed" && finalReport && (
          <div className="space-y-6 py-2">
            <Card className="bg-emerald-500/10 border-emerald-500/20">
              <CardHeader className="text-center pb-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Award className="h-6 w-6" aria-hidden="true" />
                </div>
                <CardTitle className="text-2xl font-bold">Exam Completed!</CardTitle>
                <CardDescription>
                  Your responses have been analyzed and your preliminary AI diagnostic report is ready.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Preliminary AI diagnostic score</p>
                  <div className="text-5xl font-black text-emerald-600">
                    {finalReport.finalScore}
                    <span className="text-xl font-normal text-muted-foreground"> / 100</span>
                  </div>
                </div>
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
                  role="note"
                >
                  This is AI-generated diagnostic feedback, not your official result. Your professor must review and publish the official result separately.
                </div>
              </CardContent>
            </Card>

            {(finalReport.strengths.length > 0 || finalReport.weaknesses.length > 0) && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {finalReport.strengths.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Strengths Demonstrated
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {finalReport.strengths.map((strength, index) => (
                          <li key={`${index}-${strength}`}>{strength}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {finalReport.weaknesses.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm text-amber-600">
                        <AlertCircle className="h-4 w-4" aria-hidden="true" /> Areas for Growth
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {finalReport.weaknesses.map((weakness, index) => (
                          <li key={`${index}-${weakness}`}>{weakness}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {finalReport.recommendations.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" /> Personalized Actionable Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {finalReport.recommendations.map((recommendation, index) => (
                      <li key={`${index}-${recommendation}`} className="rounded-md bg-muted p-2 text-muted-foreground">
                        {recommendation}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close Report</Button>
            </div>
          </div>
        )}

        {/* STEP 4B: SUBMITTED — no immediate report when the professor disabled it. */}
        {step === "completed" && !finalReport && (
          <div className="space-y-5 py-4">
            <Card className="bg-emerald-500/10 border-emerald-500/20">
              <CardHeader className="text-center pb-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold">Response Submitted</CardTitle>
                <CardDescription>
                  Your adaptive oral exam is complete. Your professor will review and publish the official result.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                  Pending professor review. No AI-suggested score is shown as an official result.
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Return to Dashboard</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
