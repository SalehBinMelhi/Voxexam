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
  MicOff,
  Square,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  BookOpen,
  Award,
  HelpCircle,
  Volume2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AdaptiveExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examId?: string;
  accessCode?: string;
  onValidNormalExam?: (exam: any) => void;
}

export function AdaptiveExamDialog({
  open,
  onOpenChange,
  examId,
  accessCode,
  onValidNormalExam,
}: AdaptiveExamDialogProps) {
  const { toast } = useToast();

  // Exam step state: "code_entry" | "mic_check" | "active" | "completed"
  const [step, setStep] = useState<"code_entry" | "mic_check" | "active" | "completed">("code_entry");

  // Exam state
  const [enteredCode, setEnteredCode] = useState(accessCode || "");
  const [examData, setExamData] = useState<any>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
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

  // Diagnostic Report State
  const [finalReport, setFinalReport] = useState<any>(null);

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Mic test audio ref
  const [micTestPassed, setMicTestPassed] = useState(false);
  const [isTestingMic, setIsTestingMic] = useState(false);

  useEffect(() => {
    if (accessCode) {
      setEnteredCode(accessCode);
      validateCode(accessCode);
    }
  }, [accessCode]);

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

  const validateCode = async (codeToTest?: string) => {
    const code = codeToTest || enteredCode;
    if (!code.trim()) return;

    try {
      const res = await fetch("/api/student/validate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessCode: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Validation Failed", description: data.error || "Invalid exam code", variant: "destructive" });
        return;
      }

      // Check if this is actually a normal exam
      if (data.mode !== "adaptive") {
        if (onValidNormalExam) {
          try {
            const fullRes = await fetch(`/api/exams/${data.examId}`);
            if (fullRes.ok) {
              const fullExam = await fullRes.json();
              onValidNormalExam(fullExam);
              onOpenChange(false);
              return;
            }
          } catch (e) {
            console.error("Failed to fetch full normal exam", e);
          }
        }
        toast({ title: "Invalid Exam Type", description: "This code is for a standard exam, not an adaptive exam.", variant: "destructive" });
        return;
      }

      setExamData(data);
      setStep("mic_check");
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to validate code", variant: "destructive" });
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
    if (!examData?.examId) return;
    try {
      const res = await fetch("/api/adaptive-attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: examData.examId, studentName: "Student" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Exam Start Error", description: data.error || "Could not start exam", variant: "destructive" });
        return;
      }
      setAttemptId(data.attemptId);
      setCurrentQuestion(data.currentQuestion);
      setQuestionNumber(data.questionNumber || 1);
      setTotalQuestions(data.totalQuestions || 10);
      setConceptTitle(data.conceptTitle || "");
      setStep("active");
    } catch (err) {
      toast({ title: "Error", description: "Failed to start exam", variant: "destructive" });
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
    if (!attemptId) return;
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

      const res = await fetch(`/api/adaptive-attempts/${attemptId}/answer`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Evaluation Failed", description: data.error || "Gemini evaluation failed", variant: "destructive" });
        setIsEvaluating(false);
        return;
      }

      resetRecording();

      if (data.isFinished) {
        setFinalReport(data.report || data.attempt);
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

        {/* STEP 1: CODE ENTRY */}
        {step === "code_entry" && (
          <div className="space-y-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Enter Exam Access Code</CardTitle>
                <CardDescription>Enter the 5-digit code provided by your doctor/professor.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 84920"
                    maxLength={10}
                    value={enteredCode}
                    onChange={(e) => setEnteredCode(e.target.value)}
                    className="flex-1 px-4 py-2 text-lg tracking-widest border rounded-md font-mono bg-background"
                  />
                  <Button onClick={() => validateCode()}>Validate Code</Button>
                </div>
              </CardContent>
            </Card>
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
              <Button variant="outline" onClick={() => setStep("code_entry")}>Back</Button>
              <Button onClick={startExamAttempt} disabled={!micTestPassed}>
                Start Adaptive Oral Exam
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

        {/* STEP 4: COMPLETED DIAGNOSTIC REPORT */}
        {step === "completed" && finalReport && (
          <div className="space-y-6 py-2">
            <Card className="bg-emerald-500/10 border-emerald-500/20">
              <CardHeader className="text-center pb-4">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Award className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold">Exam Completed!</CardTitle>
                <CardDescription>Your complete oral exam attempt has been analyzed by Google Gemini.</CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                {finalReport.finalScore !== undefined && (
                  <div className="text-5xl font-black text-emerald-600 mb-2">
                    {finalReport.finalScore} <span className="text-xl font-normal text-muted-foreground">/ 100</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* STRENGTHS & WEAKNESSES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-emerald-600 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" /> Strengths Demonstrated
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {finalReport.strengths?.map((s: string, idx: number) => (
                    <li key={idx} className="list-disc list-inside text-muted-foreground">{s}</li>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-amber-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" /> Areas for Growth
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  {finalReport.weaknesses?.map((w: string, idx: number) => (
                    <li key={idx} className="list-disc list-inside text-muted-foreground">{w}</li>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* RECOMMENDATIONS */}
            {finalReport.recommendations?.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Personalized Actionable Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {finalReport.recommendations.map((rec: string, idx: number) => (
                    <div key={idx} className="p-2 bg-muted rounded-md text-muted-foreground">{rec}</div>
                  ))}
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Close Report</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
