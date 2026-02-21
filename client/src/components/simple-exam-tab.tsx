import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  X,
  FileQuestion,
  Mic,
  MessageSquare,
  ListChecks,
  Users,
  Upload,
  FileText,
  Pencil,
  Calendar,
  Clock,
  Trophy,
  User,
  Check,
  Edit2,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { InsertQuestion, QuestionType, Exam, ExamSubmission, User as UserType } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { TakeExamDialog } from "@/components/take-exam-dialog";
import { Eye } from "lucide-react";

function getExamStatus(exam: Exam): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (!exam.startTime || !exam.endTime) {
    return { label: "Draft", variant: "secondary" };
  }
  const now = new Date();
  const start = parseISO(exam.startTime);
  const end = parseISO(exam.endTime);
  if (isBefore(now, start)) return { label: "Scheduled", variant: "outline" };
  if (isAfter(now, end)) return { label: "Completed", variant: "default" };
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

export function SimpleExamTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<InsertQuestion[]>([]);
  const [manualStudentNames, setManualStudentNames] = useState<string[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [newQuestion, setNewQuestion] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("short");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([""]);
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");

  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);

  const { data: exams = [], isLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const { data: submissions = [] } = useQuery<ExamSubmission[]>({
    queryKey: ["/api/submissions"],
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const simpleExams = exams.filter(e => !e.classId);

  const createExamMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      questions: InsertQuestion[];
      startTime: string | null;
      endTime: string | null;
      assignedStudentNames: string[];
      materialFiles: File[];
    }) => {
      let classId: string | null = null;

      if (data.materialFiles.length > 0) {
        const classRes = await apiRequest("POST", "/api/classes", {
          name: `_simple_${data.title.substring(0, 30)}_${Date.now()}`,
        });
        const cls = await classRes.json();
        classId = cls.id;

        for (const file of data.materialFiles) {
          const formData = new FormData();
          formData.append("file", file);
          await fetch(`/api/classes/${classId}/materials`, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        }
      }

      const response = await apiRequest("POST", "/api/exams", {
        title: data.title,
        questions: data.questions,
        startTime: data.startTime,
        endTime: data.endTime,
        classId,
        assignedStudentNames: data.assignedStudentNames,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Exam created", description: "Your quick exam has been created." });
      resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create exam.", variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setQuestions([]);
    setManualStudentNames([]);
    setNewStudentName("");
    setStartTime("");
    setEndTime("");
    setMaterialFiles([]);
    setNewQuestion("");
    setNewQuestionType("short");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
    setEditingIndex(null);
  };

  const addStudentName = () => {
    const name = newStudentName.trim();
    if (name && !manualStudentNames.includes(name)) {
      setManualStudentNames([...manualStudentNames, name]);
      setNewStudentName("");
    }
  };

  const removeStudentName = (name: string) => {
    setManualStudentNames(manualStudentNames.filter((n) => n !== name));
  };

  const addQuestion = () => {
    if (!newQuestion.trim()) return;
    const question: InsertQuestion = {
      text: newQuestion.trim(),
      type: newQuestionType,
      options: newQuestionType === "mcq" ? newQuestionOptions.filter((o) => o.trim()) : undefined,
      correctAnswer: newCorrectAnswer.trim() || undefined,
    };
    if (editingIndex !== null) {
      const updated = [...questions];
      updated[editingIndex] = question;
      setQuestions(updated);
      setEditingIndex(null);
    } else {
      setQuestions([...questions, question]);
    }
    setNewQuestion("");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
    setNewQuestionType("short");
  };

  const editQuestion = (index: number) => {
    const q = questions[index];
    setNewQuestion(q.text);
    setNewQuestionType(q.type);
    setNewQuestionOptions(q.options && q.options.length > 0 ? [...q.options] : [""]);
    setNewCorrectAnswer(q.correctAnswer || "");
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setNewQuestion("");
    setNewQuestionType("short");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
    if (editingIndex === index) cancelEdit();
  };

  const addOption = () => setNewQuestionOptions([...newQuestionOptions, ""]);
  const updateOption = (index: number, value: string) => {
    const updated = [...newQuestionOptions];
    updated[index] = value;
    setNewQuestionOptions(updated);
  };
  const removeOption = (index: number) => setNewQuestionOptions(newQuestionOptions.filter((_, i) => i !== index));

  const handleSubmit = () => {
    if (!title.trim() || questions.length === 0) {
      toast({ title: "Missing info", description: "Please provide a title and at least one question.", variant: "destructive" });
      return;
    }
    createExamMutation.mutate({
      title: title.trim(),
      questions,
      startTime: startTime || null,
      endTime: endTime || null,
      assignedStudentNames: manualStudentNames,
      materialFiles,
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setMaterialFiles(prev => [...prev, ...Array.from(files)]);
    }
    e.target.value = "";
  };

  const getQuestionIcon = (type: QuestionType) => {
    switch (type) {
      case "mcq": return <ListChecks className="h-4 w-4" />;
      case "audio": return <Mic className="h-4 w-4" />;
      default: return <MessageSquare className="h-4 w-4" />;
    }
  };

  const [editingScore, setEditingScore] = useState<{ submissionId: string; questionId: string; currentScore: number } | null>(null);
  const [newScoreValue, setNewScoreValue] = useState("");

  const updateScoreMutation = useMutation({
    mutationFn: async ({ submissionId, questionId, score }: { submissionId: string; questionId: string; score: number }) => {
      await apiRequest("PATCH", `/api/submissions/${submissionId}/score`, { questionId, score });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Score updated" });
      setEditingScore(null);
      setNewScoreValue("");
    },
  });

  const generateFeedbackMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const response = await apiRequest("POST", `/api/submissions/${submissionId}/feedback`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({ title: "Feedback generated" });
    },
  });

  const startEditing = (submissionId: string, questionId: string, currentScore: number) => {
    setEditingScore({ submissionId, questionId, currentScore });
    setNewScoreValue(Math.round(currentScore * 100).toString());
  };

  const saveScore = () => {
    if (!editingScore) return;
    const scorePercent = parseInt(newScoreValue, 10);
    if (isNaN(scorePercent) || scorePercent < 0 || scorePercent > 100) return;
    updateScoreMutation.mutate({ submissionId: editingScore.submissionId, questionId: editingScore.questionId, score: scorePercent / 100 });
  };

  if (selectedExam) {
    const examSubmissions = submissions.filter(s => s.examId === selectedExam.id);
    const status = getExamStatus(selectedExam);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedExam(null)} data-testid="button-back-to-simple">
            <X className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{selectedExam.title}</h3>
            <p className="text-sm text-muted-foreground">{selectedExam.questions.length} question{selectedExam.questions.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewExam(selectedExam)} disabled={selectedExam.questions.length === 0} data-testid="button-preview-simple-exam">
              <Eye className="h-4 w-4 mr-1" />
              Preview as Student
            </Button>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

        {examSubmissions.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                  <p className={`text-sm font-medium ${getScoreColor(examSubmissions.reduce((s, sub) => s + sub.totalScore, 0) / examSubmissions.length)}`}>
                    {((examSubmissions.reduce((s, sub) => s + sub.totalScore, 0) / examSubmissions.length) * 100).toFixed(0)}%
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Submissions</p>
                  <p className="text-sm font-medium">{examSubmissions.length} received</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-sm font-medium">Questions</h4>
          {selectedExam.questions.map((q, i) => (
            <Card key={q.id}>
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center text-xs font-medium flex-shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">{q.text}</p>
                    <Badge variant="secondary" className="text-[10px] mt-1">
                      {getQuestionIcon(q.type)}
                      <span className="ml-1">{q.type.toUpperCase()}</span>
                    </Badge>
                    {q.correctAnswer && q.type !== "mcq" && (
                      <p className="text-xs text-muted-foreground mt-1">Expected: {q.correctAnswer}</p>
                    )}
                    {q.options && q.options.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {q.options.map((opt, j) => (
                          <p key={j} className={`text-xs pl-3 ${opt === q.correctAnswer ? "text-green-600 dark:text-green-400 font-medium" : "text-muted-foreground"}`}>
                            {j + 1}. {opt}{opt === q.correctAnswer && " ✓"}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedExam.assignedStudentNames && selectedExam.assignedStudentNames.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assigned Students
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {selectedExam.assignedStudentNames.map((name) => (
                <Badge key={name} variant="outline" className="text-xs">{name}</Badge>
              ))}
            </div>
          </div>
        )}

        {examSubmissions.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Student Results ({examSubmissions.length})
              </h4>
              {examSubmissions.map((sub) => {
                const student = allUsers.find((u) => u.id === sub.studentId);
                const studentName = student
                  ? (student.firstName ? `${student.firstName} ${student.lastName || ""}`.trim() : student.email || "Unknown")
                  : "Unknown Student";
                const isExpanded = expandedSubmission === sub.id;
                const feedback = sub.feedback as { strengths: string; weakPoints: string; recommendations: string } | null;

                return (
                  <Card key={sub.id} data-testid={`submission-card-${sub.id}`}>
                    <CardContent className="p-0">
                      <button
                        className="w-full p-4 flex items-center justify-between gap-2 hover:bg-muted/50 transition-colors rounded-t-lg"
                        onClick={() => setExpandedSubmission(isExpanded ? null : sub.id)}
                        data-testid={`button-expand-submission-${sub.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium">{studentName}</p>
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(parseISO(sub.submittedAt), "MMM d, yyyy h:mm a")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(sub.totalScore)} ${getScoreColor(sub.totalScore)}`}>
                            Score: {(sub.totalScore * 100).toFixed(0)}%
                          </div>
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
                                      <TrendingUp className="h-3 w-3" /> Strengths
                                    </p>
                                    <p className="text-xs text-green-800 dark:text-green-300 break-words">{feedback.strengths}</p>
                                  </div>
                                )}
                                {feedback.weakPoints && (
                                  <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-3 border border-red-200 dark:border-red-800">
                                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1 mb-1">
                                      <TrendingDown className="h-3 w-3" /> Weak Points
                                    </p>
                                    <p className="text-xs text-red-800 dark:text-red-300 break-words">{feedback.weakPoints}</p>
                                  </div>
                                )}
                                {feedback.recommendations && (
                                  <div className="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3 border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1 mb-1">
                                      <BookOpen className="h-3 w-3" /> Recommendations
                                    </p>
                                    <p className="text-xs text-blue-800 dark:text-blue-300 break-words">{feedback.recommendations}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {!feedback && (
                            <div className="mt-4 flex items-center justify-between bg-muted/50 rounded-md p-3">
                              <p className="text-xs text-muted-foreground">No AI feedback yet</p>
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
                              const question = selectedExam.questions.find(q => q.id === resp.questionId);
                              const score = sub.scores[resp.questionId] || 0;
                              const gradingMethod = sub.gradingMethods?.[resp.questionId];
                              const isEditingThis = editingScore?.submissionId === sub.id && editingScore?.questionId === resp.questionId;
                              const methodLabel = gradingMethod === "ai" ? "AI" : gradingMethod === "manual" ? "Manual" : gradingMethod === "exact" ? "Auto" : "Fallback";

                              return (
                                <div key={resp.questionId} className="rounded-md border p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-medium break-words flex-1">
                                      <span className="text-muted-foreground">Q{idx + 1}:</span> {question?.text || "Unknown question"}
                                    </p>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {isEditingThis ? (
                                        <div className="flex items-center gap-1">
                                          <Input type="number" min="0" max="100" value={newScoreValue} onChange={(e) => setNewScoreValue(e.target.value)} className="w-14 h-6 text-[10px]" />
                                          <span className="text-[10px] text-muted-foreground">%</span>
                                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={saveScore}>
                                            <Check className="h-3 w-3 text-green-600" />
                                          </Button>
                                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingScore(null)}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${getScoreBg(score)} ${getScoreColor(score)}`}>
                                            {(score * 100).toFixed(0)}%
                                          </div>
                                          {gradingMethod && <span className="text-[10px] text-muted-foreground">{methodLabel}</span>}
                                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEditing(sub.id, resp.questionId, score)}>
                                            <Edit2 className="h-3 w-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {question?.correctAnswer && (
                                    <p className="text-[10px] text-muted-foreground">Expected: {question.correctAnswer}</p>
                                  )}
                                  <p className="text-[10px]">Answer: {resp.response || "(no text response)"}</p>
                                  {resp.transcript && <p className="text-[10px] text-muted-foreground italic">Transcript: {resp.transcript}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {examSubmissions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No submissions yet</p>
              )}
            </div>
          </>
        )}

        {previewExam && (
          <TakeExamDialog
            exam={previewExam}
            open={!!previewExam}
            onOpenChange={(open) => !open && setPreviewExam(null)}
            previewMode
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Card data-testid="card-simple-exam-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileQuestion className="h-5 w-5" />
            Create a Quick Exam
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Add questions manually, assign students, and optionally upload reference materials for AI grading
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="simple-title">Exam Title</Label>
            <Input
              id="simple-title"
              placeholder="e.g., Pop Quiz - Chapter 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-simple-exam-title"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="simple-start">Start Time (optional)</Label>
              <Input id="simple-start" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} data-testid="input-simple-start-time" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="simple-end">End Time (optional)</Label>
              <Input id="simple-end" type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} data-testid="input-simple-end-time" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Assign Students</Label>
              <span className="text-sm text-muted-foreground">{manualStudentNames.length} assigned</span>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Student name or email..."
                value={newStudentName}
                onChange={(e) => setNewStudentName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStudentName(); } }}
                data-testid="input-simple-student-name"
              />
              <Button variant="outline" onClick={addStudentName} disabled={!newStudentName.trim()} data-testid="button-simple-add-student">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {manualStudentNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {manualStudentNames.map((name) => (
                  <Badge key={name} variant="default" className="cursor-pointer" onClick={() => removeStudentName(name)}>
                    <Users className="h-3 w-3 mr-1" />{name}<X className="h-3 w-3 ml-1" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label>Reference Materials (optional)</Label>
            <p className="text-xs text-muted-foreground">Upload files so the AI can use them as context when grading answers</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.txt,.md,.csv,.json,.docx,.pptx,.xlsx,.xls"
              onChange={handleFileSelect}
              multiple
              data-testid="input-simple-file-upload"
            />
            <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} data-testid="button-simple-upload-material">
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
            {materialFiles.length > 0 && (
              <div className="space-y-1">
                {materialFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <p className="text-sm truncate">{f.name}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => setMaterialFiles(materialFiles.filter((_, j) => j !== i))}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-4">
            <Label>Questions ({questions.length})</Label>

            {questions.length > 0 && (
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <Card key={i} className={`overflow-hidden ${editingIndex === i ? "ring-2 ring-primary" : ""}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <div className="mt-0.5">{getQuestionIcon(q.type)}</div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <p className="text-sm font-medium break-words whitespace-pre-wrap">{q.text}</p>
                            {q.correctAnswer && <p className="text-xs text-muted-foreground mt-1 break-words">Expected: {q.correctAnswer}</p>}
                            {q.options && q.options.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {q.options.map((opt, oi) => (
                                  <span key={oi} className="text-xs bg-muted px-1.5 py-0.5 rounded">{opt}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editQuestion(i)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeQuestion(i)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileQuestion className="h-4 w-4" />
                  {editingIndex !== null ? "Edit Question" : "Add Question"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Textarea
                    placeholder="Enter your question..."
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    data-testid="textarea-simple-question"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Question Type</Label>
                    <Select value={newQuestionType} onValueChange={(v) => setNewQuestionType(v as QuestionType)}>
                      <SelectTrigger data-testid="select-simple-question-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="short">Short Answer</SelectItem>
                        <SelectItem value="mcq">Multiple Choice</SelectItem>
                        <SelectItem value="audio">Audio Response</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Answer</Label>
                    <Input placeholder="For auto-grading..." value={newCorrectAnswer} onChange={(e) => setNewCorrectAnswer(e.target.value)} data-testid="input-simple-correct-answer" />
                  </div>
                </div>

                {newQuestionType === "mcq" && (
                  <div className="space-y-2">
                    <Label>Answer Options</Label>
                    {newQuestionOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input placeholder={`Option ${i + 1}`} value={opt} onChange={(e) => updateOption(i, e.target.value)} />
                        {newQuestionOptions.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeOption(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
                    </Button>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={addQuestion} disabled={!newQuestion.trim()} data-testid="button-simple-add-question">
                    {editingIndex !== null ? "Update Question" : "Add Question"}
                  </Button>
                  {editingIndex !== null && (
                    <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={!title.trim() || questions.length === 0 || createExamMutation.isPending}
            data-testid="button-create-simple-exam"
          >
            {createExamMutation.isPending ? "Creating..." : "Create Exam"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          My Quick Exams
        </h3>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-5 bg-muted rounded w-3/4" /></CardHeader>
                <CardContent><div className="h-4 bg-muted rounded w-full" /></CardContent>
              </Card>
            ))}
          </div>
        ) : simpleExams.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground text-sm">No quick exams created yet. Use the form above to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {simpleExams.map((exam) => {
              const status = getExamStatus(exam);
              const examSubs = submissions.filter(s => s.examId === exam.id);
              return (
                <Card
                  key={exam.id}
                  className="cursor-pointer hover-elevate transition-all"
                  onClick={() => setSelectedExam(exam)}
                  data-testid={`card-simple-exam-${exam.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <FileQuestion className="h-3.5 w-3.5" />
                      {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{(exam.assignedStudentNames?.length || 0)} assigned</span>
                    </div>
                    {examSubs.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{examSubs.length} submission{examSubs.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
