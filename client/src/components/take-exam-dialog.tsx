import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  FileQuestion,
  Mic,
  MicOff,
  Square,
  Trash2,
  MessageSquare,
  ListChecks,
  CheckCircle2,
  Trophy,
  Eye,
  Video,
  Monitor,
} from "lucide-react";
import type { Exam, ExamResponse, ExamSubmission, QuestionType } from "@shared/schema";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface AudioRecorderProps {
  questionId: string;
  textValue: string;
  audioData: string;
  onTextChange: (text: string) => void;
  onAudioChange: (audioBase64: string) => void;
  transcript: string;
  onTranscriptChange: (transcript: string) => void;
}

function AudioRecorder({ questionId, textValue, audioData, onTextChange, onAudioChange, transcript, onTranscriptChange }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [browserUnsupported, setBrowserUnsupported] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const selectedMimeTypeRef = useRef<string>('audio/webm');

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.MediaRecorder) {
      setBrowserUnsupported(true);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getSupportedMimeType = (): string => {
    if (typeof MediaRecorder === 'undefined') {
      return 'audio/webm';
    }
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  };

  const startRecording = async () => {
    if (!window.MediaRecorder) {
      setBrowserUnsupported(true);
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      selectedMimeTypeRef.current = mimeType;
      
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, { mimeType });
      } catch {
        mediaRecorder = new MediaRecorder(stream);
        selectedMimeTypeRef.current = mediaRecorder.mimeType || 'audio/webm';
      }
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: selectedMimeTypeRef.current });
        const base64Audio = await blobToBase64(audioBlob);
        onAudioChange(base64Audio);
        stream.getTracks().forEach(track => track.stop());
        
        setIsTranscribing(true);
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audioData: base64Audio }),
          });
          const data = await res.json();
          if (data.transcript) {
            onTranscriptChange(data.transcript);
          } else {
            onTranscriptChange("");
          }
        } catch {
          onTranscriptChange("");
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      setPermissionDenied(false);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setPermissionDenied(true);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const deleteRecording = () => {
    onAudioChange('');
    onTranscriptChange('');
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasRecording = audioData && audioData.length > 0;

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-md bg-muted/50 text-center space-y-4">
        {browserUnsupported ? (
          <>
            <MicOff className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">Audio recording not supported</p>
            <p className="text-xs text-muted-foreground">
              Your browser doesn't support audio recording. Please type your response below.
            </p>
          </>
        ) : permissionDenied ? (
          <>
            <MicOff className="h-8 w-8 mx-auto text-destructive" />
            <p className="text-sm text-destructive font-medium">Microphone access denied</p>
            <p className="text-xs text-muted-foreground">
              Please type your response below instead.
            </p>
          </>
        ) : isRecording ? (
          <>
            <div className="relative">
              <div className="w-20 h-20 mx-auto rounded-full bg-destructive/20 flex items-center justify-center animate-pulse">
                <Mic className="h-10 w-10 text-destructive" />
              </div>
            </div>
            <p className="text-2xl font-mono font-medium">{formatTime(recordingTime)}</p>
            <p className="text-sm text-muted-foreground">Recording...</p>
            <Button 
              variant="destructive" 
              size="lg"
              onClick={stopRecording}
              data-testid="button-stop-recording"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Recording
            </Button>
          </>
        ) : hasRecording ? (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-chart-2/20 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-chart-2" />
            </div>
            <p className="text-sm font-medium">Recording saved</p>
            <audio 
              controls
              src={audioData} 
              className="w-full max-w-xs mx-auto"
              data-testid="audio-playback"
            />
            {isTranscribing && (
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground" data-testid="transcribing-indicator">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Transcribing your recording...
              </div>
            )}
            {!isTranscribing && transcript && (
              <div className="text-left bg-muted/80 rounded-md p-3 mt-2" data-testid="transcript-preview">
                <p className="text-xs font-medium text-muted-foreground mb-1">AI Transcript:</p>
                <p className="text-sm">{transcript}</p>
              </div>
            )}
            {!isTranscribing && !transcript && audioData && (
              <p className="text-xs text-muted-foreground">Transcript not available. You can type your response below.</p>
            )}
            <Button 
              variant="outline"
              onClick={deleteRecording}
              data-testid="button-delete-recording"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Re-record
            </Button>
          </>
        ) : (
          <>
            <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <Mic className="h-10 w-10 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              Click to record your verbal answer, or type below
            </p>
            <Button 
              size="lg"
              onClick={startRecording}
              data-testid="button-start-recording"
            >
              <Mic className="h-4 w-4 mr-2" />
              Start Recording
            </Button>
          </>
        )}
      </div>
      
      <div>
        <Label className="text-sm text-muted-foreground mb-2 block">
          Type your response for grading:
        </Label>
        <Textarea
          placeholder="Type your verbal response here..."
          value={textValue}
          onChange={(e) => onTextChange(e.target.value)}
          rows={3}
          data-testid="textarea-audio-response"
        />
      </div>
    </div>
  );
}

interface TakeExamDialogProps {
  exam: Exam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previewMode?: boolean;
}

type ExamPhase = "setup" | "exam" | "results";

export function TakeExamDialog({ exam, open, onOpenChange, previewMode = false }: TakeExamDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<ExamPhase>("setup");
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<Map<string, string>>(new Map());
  const [audioResponses, setAudioResponses] = useState<Map<string, string>>(new Map());
  const [transcripts, setTranscripts] = useState<Map<string, string>>(new Map());
  const [submissionResult, setSubmissionResult] = useState<ExamSubmission | null>(null);

  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [webcamReady, setWebcamReady] = useState(false);
  const [screenReady, setScreenReady] = useState(false);
  const [webcamError, setWebcamError] = useState("");
  const [screenError, setScreenError] = useState("");

  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const webcamRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const webcamChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!open) {
      stopAllStreams();
      setPhase("setup");
      setWebcamReady(false);
      setScreenReady(false);
      setWebcamError("");
      setScreenError("");
    }
    return () => {
      stopAllStreams();
    };
  }, [open]);

  useEffect(() => {
    if (webcamStream && webcamVideoRef.current) {
      webcamVideoRef.current.srcObject = webcamStream;
    }
  }, [webcamStream, phase]);

  const stopAllStreams = () => {
    if (screenRecorderRef.current && screenRecorderRef.current.state !== "inactive") {
      screenRecorderRef.current.stop();
    }
    if (webcamRecorderRef.current && webcamRecorderRef.current.state !== "inactive") {
      webcamRecorderRef.current.stop();
    }
    webcamStream?.getTracks().forEach(t => t.stop());
    screenStream?.getTracks().forEach(t => t.stop());
    setWebcamStream(null);
    setScreenStream(null);
    screenRecorderRef.current = null;
    webcamRecorderRef.current = null;
    screenChunksRef.current = [];
    webcamChunksRef.current = [];
  };

  const startWebcam = async () => {
    try {
      setWebcamError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setWebcamStream(stream);
      setWebcamReady(true);
    } catch (err: any) {
      setWebcamError("Camera access denied. You must enable your camera to take this exam.");
      setWebcamReady(false);
    }
  };

  const startScreenShare = async () => {
    try {
      setScreenError("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor" } as any,
        audio: false,
        preferCurrentTab: false,
      } as any);
      setScreenStream(stream);
      setScreenReady(true);
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        setScreenStream(null);
        setScreenReady(false);
      });
    } catch (err: any) {
      setScreenError("Screen sharing denied. You must share your screen to take this exam.");
      setScreenReady(false);
    }
  };

  const startRecordings = () => {
    if (screenStream) {
      screenChunksRef.current = [];
      const recorder = new MediaRecorder(screenStream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) screenChunksRef.current.push(e.data); };
      recorder.start(1000);
      screenRecorderRef.current = recorder;
    }
    if (webcamStream) {
      webcamChunksRef.current = [];
      const recorder = new MediaRecorder(webcamStream, { mimeType: "video/webm" });
      recorder.ondataavailable = (e) => { if (e.data.size > 0) webcamChunksRef.current.push(e.data); };
      recorder.start(1000);
      webcamRecorderRef.current = recorder;
    }
  };

  const stopRecordings = (): Promise<{ screenBlob: Blob | null; webcamBlob: Blob | null }> => {
    return new Promise((resolve) => {
      let screenBlob: Blob | null = null;
      let webcamBlob: Blob | null = null;
      let pending = 0;

      const checkDone = () => {
        if (pending === 0) resolve({ screenBlob, webcamBlob });
      };

      if (screenRecorderRef.current && screenRecorderRef.current.state !== "inactive") {
        pending++;
        screenRecorderRef.current.onstop = () => {
          screenBlob = screenChunksRef.current.length > 0 ? new Blob(screenChunksRef.current, { type: "video/webm" }) : null;
          pending--;
          checkDone();
        };
        screenRecorderRef.current.stop();
      }

      if (webcamRecorderRef.current && webcamRecorderRef.current.state !== "inactive") {
        pending++;
        webcamRecorderRef.current.onstop = () => {
          webcamBlob = webcamChunksRef.current.length > 0 ? new Blob(webcamChunksRef.current, { type: "video/webm" }) : null;
          pending--;
          checkDone();
        };
        webcamRecorderRef.current.stop();
      }

      if (pending === 0) resolve({ screenBlob, webcamBlob });
    });
  };

  const handleStartExam = () => {
    startRecordings();
    setPhase("exam");
  };

  const submitMutation = useMutation({
    mutationFn: async (data: { examId: string; responses: ExamResponse[]; studentId: string; isPreview?: boolean }) => {
      const response = await apiRequest("POST", "/api/submissions", data);
      const submission = await response.json();
      return submission as ExamSubmission;
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      setSubmissionResult(result);
      setPhase("results");

      const { screenBlob, webcamBlob } = await stopRecordings();

      if ((screenBlob || webcamBlob) && result.id) {
        try {
          const formData = new FormData();
          if (screenBlob) formData.append("screenRecording", screenBlob, "screen.webm");
          if (webcamBlob) formData.append("webcamRecording", webcamBlob, "webcam.webm");
          await fetch(`/api/submissions/${result.id}/recordings`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        } catch (e) {
          console.error("Failed to upload recordings:", e);
        }
      }

      stopAllStreams();

      toast({
        title: previewMode ? "Preview graded" : "Exam submitted",
        description: previewMode
          ? "Your preview has been graded by AI. This is a test run."
          : "Your answers have been submitted and graded.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit exam. Please try again.",
        variant: "destructive",
      });
    },
  });

  const currentQuestion = exam.questions[currentQuestionIndex];
  const totalQuestions = exam.questions.length;
  const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
  
  const answeredCount = exam.questions.filter(q => 
    responses.has(q.id) || audioResponses.has(q.id)
  ).length;

  const timeRemaining = exam.endTime
    ? Math.max(0, differenceInMinutes(parseISO(exam.endTime), new Date()))
    : null;

  const handleResponseChange = (value: string) => {
    const newResponses = new Map(responses);
    newResponses.set(currentQuestion.id, value);
    setResponses(newResponses);
  };

  const handleAudioChange = (questionId: string, audioData: string) => {
    const newAudioResponses = new Map(audioResponses);
    if (audioData) {
      newAudioResponses.set(questionId, audioData);
    } else {
      newAudioResponses.delete(questionId);
    }
    setAudioResponses(newAudioResponses);
  };

  const handleTranscriptChange = (questionId: string, transcript: string) => {
    const newTranscripts = new Map(transcripts);
    if (transcript) {
      newTranscripts.set(questionId, transcript);
    } else {
      newTranscripts.delete(questionId);
    }
    setTranscripts(newTranscripts);
  };

  const goToNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const goToPrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    const examResponses: ExamResponse[] = exam.questions.map((q) => ({
      questionId: q.id,
      response: responses.get(q.id) || "",
      audioData: audioResponses.get(q.id),
    }));

    submitMutation.mutate({
      examId: exam.id,
      responses: examResponses,
      studentId: user?.id || "",
      isPreview: previewMode || undefined,
    });
  };

  const handleClose = () => {
    stopAllStreams();
    setPhase("setup");
    setCurrentQuestionIndex(0);
    setResponses(new Map());
    setAudioResponses(new Map());
    setTranscripts(new Map());
    setSubmissionResult(null);
    setWebcamReady(false);
    setScreenReady(false);
    setWebcamError("");
    setScreenError("");
    onOpenChange(false);
  };

  const getQuestionIcon = (type: QuestionType) => {
    switch (type) {
      case "mcq":
        return <ListChecks className="h-4 w-4" />;
      case "audio":
        return <Mic className="h-4 w-4" />;
      default:
        return <MessageSquare className="h-4 w-4" />;
    }
  };

  if (phase === "setup") {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {exam.title}
              {previewMode && <Badge variant="secondary" className="text-xs font-normal">Preview</Badge>}
            </DialogTitle>
            <DialogDescription>
              Before starting, enable your camera and share your screen. Both are required during the exam.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {previewMode && (
              <div className="rounded-md bg-primary/5 border border-primary/20 p-3 flex items-center gap-2" data-testid="preview-banner">
                <Eye className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm text-primary">Preview mode — your answers will be AI-graded but flagged as a test run.</p>
              </div>
            )}

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Camera</span>
                </div>
                {webcamReady ? (
                  <Badge variant="default" className="bg-green-600" data-testid="webcam-status-ready">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Button size="sm" onClick={startWebcam} data-testid="button-enable-webcam">
                    <Video className="h-4 w-4 mr-1" /> Enable Camera
                  </Button>
                )}
              </div>
              {webcamReady && webcamStream && (
                <video
                  ref={webcamVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full max-w-[200px] mx-auto rounded-md border aspect-video object-cover"
                  data-testid="webcam-preview"
                />
              )}
              {webcamError && <p className="text-sm text-destructive">{webcamError}</p>}
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-sm">Screen Recording</span>
                </div>
                {screenReady ? (
                  <Badge variant="default" className="bg-green-600" data-testid="screen-status-ready">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Button size="sm" onClick={startScreenShare} data-testid="button-share-screen">
                    <Monitor className="h-4 w-4 mr-1" /> Share Screen
                  </Button>
                )}
              </div>
              {screenError && <p className="text-sm text-destructive">{screenError}</p>}
              {!screenReady && <p className="text-xs text-muted-foreground">Please select "Entire Screen" when prompted for the best experience</p>}
            </div>

            <div className="text-xs text-muted-foreground text-center">
              {totalQuestions} question{totalQuestions !== 1 ? "s" : ""} · Your screen and camera will be recorded throughout the exam
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} data-testid="button-cancel-exam">
              Cancel
            </Button>
            <Button
              onClick={handleStartExam}
              disabled={!webcamReady || !screenReady}
              data-testid="button-start-exam"
            >
              <Send className="h-4 w-4 mr-2" />
              {previewMode ? "Start Preview" : "Start Exam"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (phase === "results" && submissionResult) {
    const understandingScores = submissionResult.understandingScores || {};
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="text-center flex-shrink-0">
            <div className="mx-auto w-16 h-16 rounded-full bg-chart-2/10 flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-chart-2" />
            </div>
            <DialogTitle className="text-2xl flex items-center justify-center gap-2">
              {previewMode ? "Preview Results" : "Exam Completed!"}
              {previewMode && <Badge variant="secondary" className="text-xs font-normal">Preview</Badge>}
            </DialogTitle>
            <DialogDescription>
              {previewMode
                ? "AI grading results for your test run — this was not a real submission"
                : "Your answers have been submitted and graded"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-6 space-y-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-4xl font-bold text-primary">
                  {(submissionResult.totalScore * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Correctness</p>
              </div>
              <div>
                <p className="text-4xl font-bold text-blue-600 dark:text-blue-400">
                  {((submissionResult.totalUnderstandingScore ?? submissionResult.totalScore) * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Understanding</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Question Breakdown</h4>
              <div className="space-y-2">
                {exam.questions.map((q, i) => {
                  const score = submissionResult.scores[q.id] || 0;
                  const uScore = understandingScores[q.id] ?? score;
                  return (
                    <div key={q.id} className="rounded-md border p-2 space-y-1">
                      <p className="text-xs text-muted-foreground truncate">
                        Q{i + 1}: {q.text.slice(0, 40)}{q.text.length > 40 ? "..." : ""}
                      </p>
                      <div className="flex items-center gap-2">
                        <Badge variant={score >= 0.7 ? "default" : score >= 0.5 ? "secondary" : "destructive"}>
                          Correctness: {(score * 100).toFixed(0)}%
                        </Badge>
                        <Badge variant={uScore >= 0.7 ? "default" : uScore >= 0.5 ? "secondary" : "destructive"} className="bg-blue-600/80">
                          Understanding: {(uScore * 100).toFixed(0)}%
                        </Badge>
                      </div>
                      {previewMode && q.correctAnswer && (
                        <p className="text-xs text-green-600 dark:text-green-400">Expected: {q.correctAnswer}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {submissionResult.feedback && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">AI Feedback</h4>
                {submissionResult.feedback.strengths && (
                  <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-2">
                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Strengths</p>
                    <p className="text-xs">{submissionResult.feedback.strengths}</p>
                  </div>
                )}
                {submissionResult.feedback.weakPoints && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-2">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Areas to Improve</p>
                    <p className="text-xs">{submissionResult.feedback.weakPoints}</p>
                  </div>
                )}
                {submissionResult.feedback.recommendations && (
                  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-2">
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Recommendations</p>
                    <p className="text-xs">{submissionResult.feedback.recommendations}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button className="w-full" onClick={handleClose} data-testid="button-close-results">
              {previewMode ? "Close Preview" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  {exam.title}
                  {previewMode && (
                    <Badge variant="secondary" className="text-xs font-normal">Preview</Badge>
                  )}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  <FileQuestion className="h-4 w-4" />
                  Question {currentQuestionIndex + 1} of {totalQuestions}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {webcamStream && (
                <div className="relative">
                  <video
                    ref={webcamVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-16 h-12 rounded border object-cover"
                    data-testid="webcam-feed-mini"
                  />
                  <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                </div>
              )}
              {timeRemaining !== null && (
                <Badge
                  variant={timeRemaining < 10 ? "destructive" : "outline"}
                  className="flex items-center gap-1"
                >
                  <Clock className="h-3.5 w-3.5" />
                  {timeRemaining} min left
                </Badge>
              )}
            </div>
          </div>
          <Progress value={progress} className="mt-4" />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-2 -mr-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="py-6">
            {previewMode && (
              <div className="mb-4 rounded-md bg-primary/5 border border-primary/20 p-3 flex items-center gap-2" data-testid="preview-banner">
                <Eye className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm text-primary">Preview mode — your answers will be AI-graded but flagged as a test run.</p>
              </div>
            )}
            <Card>
              <CardContent className="p-6 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
                    {currentQuestionIndex + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">
                        {getQuestionIcon(currentQuestion.type)}
                        <span className="ml-1">
                          {currentQuestion.type.toUpperCase()}
                        </span>
                      </Badge>
                      {(responses.has(currentQuestion.id) || audioResponses.has(currentQuestion.id)) && (
                        <Badge variant="outline" className="text-chart-2">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Answered
                        </Badge>
                      )}
                    </div>
                    <p className="text-lg font-medium">{currentQuestion.text}</p>
                  </div>
                </div>

                {currentQuestion.type === "mcq" && currentQuestion.options ? (
                  <RadioGroup
                    value={responses.get(currentQuestion.id) || ""}
                    onValueChange={handleResponseChange}
                    className="space-y-3"
                  >
                    {currentQuestion.options.map((option, i) => (
                      <div
                        key={i}
                        className="flex items-center space-x-3 p-3 rounded-md border hover-elevate cursor-pointer"
                        onClick={() => handleResponseChange(option)}
                      >
                        <RadioGroupItem
                          value={option}
                          id={`option-${i}`}
                          data-testid={`radio-option-${i}`}
                        />
                        <Label
                          htmlFor={`option-${i}`}
                          className="flex-1 cursor-pointer"
                        >
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                ) : currentQuestion.type === "audio" ? (
                  <AudioRecorder
                    questionId={currentQuestion.id}
                    textValue={responses.get(currentQuestion.id) || ""}
                    audioData={audioResponses.get(currentQuestion.id) || ""}
                    onTextChange={handleResponseChange}
                    onAudioChange={(audioData) => handleAudioChange(currentQuestion.id, audioData)}
                    transcript={transcripts.get(currentQuestion.id) || ""}
                    onTranscriptChange={(transcript) => handleTranscriptChange(currentQuestion.id, transcript)}
                  />
                ) : (
                  <Textarea
                    placeholder="Type your answer here..."
                    value={responses.get(currentQuestion.id) || ""}
                    onChange={(e) => handleResponseChange(e.target.value)}
                    rows={4}
                    data-testid="textarea-short-response"
                  />
                )}
              </CardContent>
            </Card>

            <div className="mt-4 flex flex-wrap gap-2">
              {exam.questions.map((q, i) => (
                <Button
                  key={q.id}
                  variant={(responses.has(q.id) || audioResponses.has(q.id)) ? "default" : "outline"}
                  size="sm"
                  className={`w-9 h-9 p-0 ${
                    i === currentQuestionIndex ? "ring-2 ring-primary ring-offset-2" : ""
                  }`}
                  onClick={() => setCurrentQuestionIndex(i)}
                  data-testid={`button-question-nav-${i}`}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-sm text-muted-foreground">
              {answeredCount} of {totalQuestions} answered
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={goToPrevious}
              disabled={currentQuestionIndex === 0}
              data-testid="button-previous-question"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            {currentQuestionIndex < totalQuestions - 1 && (
              <Button variant="outline" onClick={goToNext} data-testid="button-next-question">
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
            <Button
              onClick={handleSubmit}
              disabled={submitMutation.isPending || answeredCount === 0}
              data-testid="button-submit-exam"
            >
              <Send className="h-4 w-4 mr-2" />
              {submitMutation.isPending ? "Grading..." : previewMode ? "Submit Preview" : "Submit Exam"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
