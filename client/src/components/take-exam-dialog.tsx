import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  Send,
  Clock,
  FileQuestion,
  Mic,
  MessageSquare,
  ListChecks,
  CheckCircle2,
  Trophy,
} from "lucide-react";
import type { Exam, ExamResponse, ExamSubmission, QuestionType } from "@shared/schema";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
  const answeredCount = responses.size;

  const timeRemaining = exam.endTime
    ? Math.max(0, differenceInMinutes(parseISO(exam.endTime), new Date()))
    : null;

  const handleResponseChange = (value: string) => {
    const newResponses = new Map(responses);
    newResponses.set(currentQuestion.id, value);
    setResponses(newResponses);
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
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

        <ScrollArea className="flex-1 pr-4">
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
                      {responses.has(currentQuestion.id) && (
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
                  <div className="space-y-3">
                    <div className="p-4 rounded-md bg-muted/50 text-center">
                      <Mic className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Audio recording is simulated. Please type your response
                        below.
                      </p>
                    </div>
                    <Textarea
                      placeholder="Type your verbal response here..."
                      value={responses.get(currentQuestion.id) || ""}
                      onChange={(e) => handleResponseChange(e.target.value)}
                      rows={4}
                      data-testid="textarea-audio-response"
                    />
                  </div>
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
                  variant={responses.has(q.id) ? "default" : "outline"}
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
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 flex-1">
            <p className="text-sm text-muted-foreground">
              {answeredCount} of {totalQuestions} answered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={goToPrevious}
              disabled={currentQuestionIndex === 0}
              data-testid="button-previous-question"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            {currentQuestionIndex < totalQuestions - 1 ? (
              <Button onClick={goToNext} data-testid="button-next-question">
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                data-testid="button-submit-exam"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitMutation.isPending ? "Submitting..." : "Submit Exam"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
