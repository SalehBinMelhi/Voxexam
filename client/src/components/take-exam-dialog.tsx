import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
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
}

function AudioRecorder({ questionId, textValue, audioData, onTextChange, onAudioChange }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
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

  const getSupportedMimeType = () => {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/wav',
      ''
    ];
    for (const type of types) {
      if (type === '' || MediaRecorder.isTypeSupported(type)) {
        return type || undefined;
      }
    }
    return undefined;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        const base64Audio = await blobToBase64(audioBlob);
        onAudioChange(base64Audio);
        stream.getTracks().forEach(track => track.stop());
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
        {permissionDenied ? (
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
}

export function TakeExamDialog({ exam, open, onOpenChange }: TakeExamDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<Map<string, string>>(new Map());
  const [audioResponses, setAudioResponses] = useState<Map<string, string>>(new Map());
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<ExamSubmission | null>(null);

  const submitMutation = useMutation({
    mutationFn: async (data: { examId: string; responses: ExamResponse[]; studentId: string }) => {
      const response = await apiRequest("POST", "/api/submissions", data);
      const submission = await response.json();
      return submission as ExamSubmission;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      setSubmitted(true);
      setSubmissionResult(result);
      toast({
        title: "Exam submitted",
        description: "Your answers have been submitted successfully.",
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
    });
  };

  const handleClose = () => {
    setCurrentQuestionIndex(0);
    setResponses(new Map());
    setAudioResponses(new Map());
    setSubmitted(false);
    setSubmissionResult(null);
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

  if (submitted && submissionResult) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-chart-2/10 flex items-center justify-center mb-4">
              <Trophy className="h-8 w-8 text-chart-2" />
            </div>
            <DialogTitle className="text-2xl">Exam Completed!</DialogTitle>
            <DialogDescription>
              Your answers have been submitted and graded
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 space-y-6">
            <div className="text-center">
              <p className="text-5xl font-bold text-primary">
                {(submissionResult.totalScore * 100).toFixed(0)}%
              </p>
              <p className="text-muted-foreground mt-1">Overall Score</p>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm">Question Breakdown</h4>
              <div className="space-y-2">
                {exam.questions.map((q, i) => {
                  const score = submissionResult.scores[q.id] || 0;
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground truncate flex-1">
                        Q{i + 1}: {q.text.slice(0, 30)}
                        {q.text.length > 30 ? "..." : ""}
                      </span>
                      <Badge
                        variant={score >= 0.7 ? "default" : score >= 0.5 ? "secondary" : "destructive"}
                      >
                        {(score * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={handleClose}>
              Close
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
            <div>
              <DialogTitle>{exam.title}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <FileQuestion className="h-4 w-4" />
                Question {currentQuestionIndex + 1} of {totalQuestions}
              </DialogDescription>
            </div>
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
          <Progress value={progress} className="mt-4" />
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-2 -mr-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="py-6">
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
              {submitMutation.isPending ? "Submitting..." : "Submit Exam"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
