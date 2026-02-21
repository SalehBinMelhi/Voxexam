import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import {
  Calendar,
  Users,
  Trash2,
  FileQuestion,
  Mic,
  MessageSquare,
  ListChecks,
  Clock,
  Trophy,
  User,
  Edit2,
  Check,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import type { Exam, ExamSubmission, QuestionType, User as UserType, ProctoringFlag } from "@shared/schema";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface ExamDetailsDialogProps {
  exam: Exam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getExamStatus(exam: Exam): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!exam.startTime || !exam.endTime) {
    return { label: "Draft", variant: "secondary" };
  }
  const now = new Date();
  const start = parseISO(exam.startTime);
  const end = parseISO(exam.endTime);

  if (isBefore(now, start)) {
    return { label: "Scheduled", variant: "outline" };
  }
  if (isAfter(now, end)) {
    return { label: "Completed", variant: "default" };
  }
  return { label: "Active", variant: "destructive" };
}

function getScoreColor(score: number) {
  if (score >= 0.8) return "text-green-600 dark:text-green-400";
  if (score >= 0.6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBg(score: number) {
  if (score >= 0.8) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 0.6) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function ExamDetailsDialog({
  exam,
  open,
  onOpenChange,
}: ExamDetailsDialogProps) {
  const { toast } = useToast();
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);

  const { data: submissions = [] } = useQuery<ExamSubmission[]>({
    queryKey: ["/api/submissions"],
    refetchOnMount: true,
    staleTime: 0,
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
    refetchOnMount: true,
    staleTime: 0,
  });

  const examSubmissions = submissions.filter((s) => s.examId === exam.id);

  const deleteExamMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/exams/${exam.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({
        title: "Exam deleted",
        description: "The exam has been deleted successfully.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete exam.",
        variant: "destructive",
      });
    },
  });

  const generateFeedbackMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const response = await apiRequest("POST", `/api/submissions/${submissionId}/feedback`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Feedback generated", description: "AI feedback has been generated for this submission." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate feedback.", variant: "destructive" });
    },
  });

  const [editingScore, setEditingScore] = useState<{
    submissionId: string;
    questionId: string;
    currentScore: number;
  } | null>(null);
  const [newScoreValue, setNewScoreValue] = useState("");

  const updateScoreMutation = useMutation({
    mutationFn: async ({ submissionId, questionId, score }: { submissionId: string; questionId: string; score: number }) => {
      await apiRequest("PATCH", `/api/submissions/${submissionId}/score`, { questionId, score });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Score updated", description: "The grade has been manually updated." });
      setEditingScore(null);
      setNewScoreValue("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update score.", variant: "destructive" });
    },
  });

  const startEditing = (submissionId: string, questionId: string, currentScore: number) => {
    setEditingScore({ submissionId, questionId, currentScore });
    setNewScoreValue(Math.round(currentScore * 100).toString());
  };

  const cancelEditing = () => {
    setEditingScore(null);
    setNewScoreValue("");
  };

  const saveScore = () => {
    if (!editingScore) return;
    const scorePercent = parseInt(newScoreValue, 10);
    if (isNaN(scorePercent) || scorePercent < 0 || scorePercent > 100) {
      toast({ title: "Invalid score", description: "Please enter a number between 0 and 100.", variant: "destructive" });
      return;
    }
    updateScoreMutation.mutate({
      submissionId: editingScore.submissionId,
      questionId: editingScore.questionId,
      score: scorePercent / 100,
    });
  };

  const status = getExamStatus(exam);

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

  const avgCorrectness = examSubmissions.length > 0
    ? examSubmissions.reduce((sum, s) => sum + s.totalScore, 0) / examSubmissions.length
    : 0;
  const avgUnderstanding = examSubmissions.length > 0
    ? examSubmissions.reduce((sum, s) => sum + (s.totalUnderstandingScore || 0), 0) / examSubmissions.length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-xl">{exam.title}</DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2">
                <FileQuestion className="h-4 w-4" />
                {exam.questions.length} question
                {exam.questions.length !== 1 ? "s" : ""}
              </DialogDescription>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-2 -mr-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-6 py-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">Schedule</p>
                      {exam.startTime && exam.endTime ? (
                        <p className="text-xs font-medium truncate">
                          {format(parseISO(exam.startTime), "MMM d, h:mm a")}
                        </p>
                      ) : (
                        <p className="text-xs font-medium">Not scheduled</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Submissions</p>
                      <p className="text-xs font-medium">{examSubmissions.length} received</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              {examSubmissions.length > 0 && (
                <>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Correctness</p>
                          <p className={`text-xs font-medium ${getScoreColor(avgCorrectness)}`}>
                            {(avgCorrectness * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Avg Understanding</p>
                          <p className={`text-xs font-medium ${getScoreColor(avgUnderstanding)}`}>
                            {(avgUnderstanding * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {exam.assignedStudentNames && exam.assignedStudentNames.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Assigned Students ({exam.assignedStudentNames.length})
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {exam.assignedStudentNames.map((name) => (
                    <Badge key={name} variant="outline" className="text-xs">
                      {name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Questions</h4>
              <div className="space-y-2">
                {exam.questions.map((q, i) => (
                  <Card key={q.id} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-2">
                        <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium break-words">{q.text}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-[10px]">
                              {getQuestionIcon(q.type)}
                              <span className="ml-1">{q.type.toUpperCase()}</span>
                            </Badge>
                            {q.options && q.options.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">{q.options.length} options</span>
                            )}
                          </div>
                          {q.options && q.options.length > 0 && (
                            <div className="mt-1.5 space-y-0.5">
                              {q.options.map((opt, j) => (
                                <p
                                  key={j}
                                  className={`text-xs pl-3 ${
                                    opt === q.correctAnswer ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"
                                  }`}
                                >
                                  {j + 1}. {opt}
                                  {opt === q.correctAnswer && " ✓"}
                                </p>
                              ))}
                            </div>
                          )}
                          {q.correctAnswer && q.type !== "mcq" && (
                            <p className="text-xs text-muted-foreground mt-1">Expected: {q.correctAnswer}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {examSubmissions.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Trophy className="h-4 w-4" />
                    Student Results ({examSubmissions.length})
                  </h4>
                  <div className="space-y-3">
                    {examSubmissions.map((sub) => {
                      const student = allUsers.find((u) => u.id === sub.studentId);
                      const studentName = student
                        ? (student.firstName ? `${student.firstName} ${student.lastName || ""}`.trim() : student.email || "Unknown")
                        : "Unknown Student";
                      const isExpanded = expandedSubmission === sub.id;
                      const feedback = sub.feedback as { strengths: string; weakPoints: string; recommendations: string } | null;
                      const proctoringFlags = (sub.proctoringFlags as ProctoringFlag[] | null) || [];
                      const hasProctoringIssues = proctoringFlags.length > 0;

                      return (
                        <Card key={sub.id} data-testid={`submission-card-${sub.id}`} className={hasProctoringIssues ? "border-amber-400 dark:border-amber-600" : ""}>
                          <CardContent className="p-0">
                            <button
                              className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors rounded-t-lg"
                              onClick={() => setExpandedSubmission(isExpanded ? null : sub.id)}
                              data-testid={`button-expand-submission-${sub.id}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div className="text-left">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium">{studentName}</p>
                                    {hasProctoringIssues && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-medium" data-testid={`badge-proctoring-${sub.id}`}>
                                        <AlertTriangle className="h-3 w-3" />
                                        {proctoringFlags.length} flag{proctoringFlags.length !== 1 ? "s" : ""}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(parseISO(sub.submittedAt), "MMM d, yyyy h:mm a")}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(sub.totalScore)} ${getScoreColor(sub.totalScore)}`} data-testid={`badge-correctness-${sub.id}`}>
                                  Correctness: {(sub.totalScore * 100).toFixed(0)}%
                                </div>
                                {sub.totalUnderstandingScore != null && (
                                  <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(sub.totalUnderstandingScore)} ${getScoreColor(sub.totalUnderstandingScore)}`} data-testid={`badge-understanding-${sub.id}`}>
                                    Understanding: {(sub.totalUnderstandingScore * 100).toFixed(0)}%
                                  </div>
                                )}
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t px-4 pb-4 space-y-4">
                                {feedback && (
                                  <div className="mt-4 space-y-3" data-testid={`feedback-section-${sub.id}`}>
                                    <h5 className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                                      <Sparkles className="h-3.5 w-3.5" />
                                      AI Feedback
                                    </h5>
                                    <div className="grid gap-2">
                                      {feedback.strengths && (
                                        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 border border-green-200 dark:border-green-800">
                                          <p className="text-xs font-semibold text-green-700 dark:text-green-400 flex items-center gap-1 mb-1">
                                            <TrendingUp className="h-3 w-3" />
                                            Strengths
                                          </p>
                                          <p className="text-xs text-green-800 dark:text-green-300 break-words">{feedback.strengths}</p>
                                        </div>
                                      )}
                                      {feedback.weakPoints && (
                                        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
                                          <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1 mb-1">
                                            <TrendingDown className="h-3 w-3" />
                                            Weak Points
                                          </p>
                                          <p className="text-xs text-red-800 dark:text-red-300 break-words">{feedback.weakPoints}</p>
                                        </div>
                                      )}
                                      {feedback.recommendations && (
                                        <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3 border border-blue-200 dark:border-blue-800">
                                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-1">
                                            <BookOpen className="h-3 w-3" />
                                            Recommendations
                                          </p>
                                          <p className="text-xs text-blue-800 dark:text-blue-300 break-words">{feedback.recommendations}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {!feedback && (
                                  <div className="mt-4 flex items-center justify-between bg-muted/50 rounded-md p-3">
                                    <p className="text-xs text-muted-foreground">No AI feedback generated yet</p>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => generateFeedbackMutation.mutate(sub.id)}
                                      disabled={generateFeedbackMutation.isPending}
                                      data-testid={`button-generate-feedback-${sub.id}`}
                                    >
                                      <Sparkles className="h-3.5 w-3.5 mr-1" />
                                      {generateFeedbackMutation.isPending ? "Generating..." : "Generate Feedback"}
                                    </Button>
                                  </div>
                                )}

                                <div className="space-y-2 mt-3">
                                  <h5 className="text-xs font-semibold text-muted-foreground">Per-Question Results</h5>
                                  {sub.responses.map((resp, idx) => {
                                    const question = exam.questions.find(q => q.id === resp.questionId);
                                    const score = sub.scores[resp.questionId] || 0;
                                    const understandingScore = sub.understandingScores?.[resp.questionId];
                                    const gradingMethod = sub.gradingMethods?.[resp.questionId];
                                    const isEditing = editingScore?.submissionId === sub.id && editingScore?.questionId === resp.questionId;
                                    const methodLabel = gradingMethod === "ai" ? "AI" : gradingMethod === "manual" ? "Manual" : gradingMethod === "exact" ? "Auto" : gradingMethod === "fallback" ? "Fallback" : "";
                                    const methodColor = gradingMethod === "ai" ? "text-blue-500" : gradingMethod === "manual" ? "text-orange-500" : gradingMethod === "exact" ? "text-green-500" : "text-yellow-500";

                                    return (
                                      <div key={resp.questionId} className="rounded-md border p-3 space-y-2" data-testid={`question-result-${resp.questionId}`}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium break-words">
                                              <span className="text-muted-foreground">Q{idx + 1}:</span>{" "}
                                              {question?.text || "Unknown question"}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1 flex-shrink-0">
                                            {isEditing ? (
                                              <div className="flex items-center gap-1">
                                                <Input
                                                  type="number"
                                                  min="0"
                                                  max="100"
                                                  value={newScoreValue}
                                                  onChange={(e) => setNewScoreValue(e.target.value)}
                                                  className="w-14 h-6 text-[10px]"
                                                  data-testid={`input-score-${resp.questionId}`}
                                                />
                                                <span className="text-[10px] text-muted-foreground">%</span>
                                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={saveScore} disabled={updateScoreMutation.isPending} data-testid={`button-save-score-${resp.questionId}`}>
                                                  <Check className="h-3 w-3 text-green-600" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={cancelEditing} data-testid={`button-cancel-score-${resp.questionId}`}>
                                                  <X className="h-3 w-3 text-red-600" />
                                                </Button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-1.5">
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getScoreBg(score)} ${getScoreColor(score)}`} data-testid={`score-correctness-${resp.questionId}`}>
                                                  {(score * 100).toFixed(0)}%
                                                </span>
                                                {understandingScore != null && (
                                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getScoreBg(understandingScore)} ${getScoreColor(understandingScore)}`} data-testid={`score-understanding-${resp.questionId}`}>
                                                    U: {(understandingScore * 100).toFixed(0)}%
                                                  </span>
                                                )}
                                                {methodLabel && (
                                                  <span className={`text-[10px] ${methodColor}`} data-testid={`grading-method-${resp.questionId}`}>
                                                    {methodLabel}
                                                  </span>
                                                )}
                                                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEditing(sub.id, resp.questionId, score)} title="Edit score" data-testid={`button-edit-score-${resp.questionId}`}>
                                                  <Edit2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="space-y-1">
                                          {question?.correctAnswer && (
                                            <p className="text-[10px] text-muted-foreground">
                                              <span className="font-medium">Expected:</span> {question.correctAnswer}
                                            </p>
                                          )}
                                          {resp.response && (
                                            <p className="text-[10px] text-foreground">
                                              <span className="font-medium text-muted-foreground">Answer:</span> {resp.response}
                                            </p>
                                          )}
                                          {resp.audioData && (
                                            <audio controls src={resp.audioData} className="h-7 w-full max-w-xs" data-testid={`audio-response-${resp.questionId}`} />
                                          )}
                                          {resp.transcript && (
                                            <div className="bg-muted/60 rounded p-1.5" data-testid={`transcript-${resp.questionId}`}>
                                              <p className="text-[10px] font-medium text-muted-foreground">Transcript:</p>
                                              <p className="text-[10px]">{resp.transcript}</p>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {hasProctoringIssues && (
                                  <div className="space-y-2 mt-3" data-testid={`proctoring-section-${sub.id}`}>
                                    <h5 className="text-xs font-semibold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                                      <AlertTriangle className="h-3.5 w-3.5" />
                                      Proctoring Alerts ({proctoringFlags.length})
                                    </h5>
                                    <div className="grid gap-2">
                                      {proctoringFlags.map((flag, flagIdx) => (
                                        <div key={flagIdx} className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 border border-amber-200 dark:border-amber-800">
                                          <div className="flex items-center justify-between mb-1">
                                            <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                              Tab Switch #{flagIdx + 1}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                              {format(parseISO(flag.timestamp), "h:mm:ss a")}
                                            </p>
                                          </div>
                                          {flag.aiVerdict && (
                                            <p className="text-xs text-amber-800 dark:text-amber-300">{flag.aiVerdict}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={() => deleteExamMutation.mutate()}
            disabled={deleteExamMutation.isPending}
            data-testid="button-delete-exam"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleteExamMutation.isPending ? "Deleting..." : "Delete Exam"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
