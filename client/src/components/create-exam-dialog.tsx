import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, X, FileQuestion, Mic, MessageSquare, ListChecks, Users } from "lucide-react";
import type { InsertQuestion, QuestionType, User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExamDialog({ open, onOpenChange }: CreateExamDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<InsertQuestion[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const [newQuestion, setNewQuestion] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("short");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([""]);
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const students = allUsers.filter((u) => u.role === "student");

  const createExamMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      questions: InsertQuestion[];
      startTime: string | null;
      endTime: string | null;
      assignedStudentIds: string[];
      professorId: string;
    }) => {
      const response = await apiRequest("POST", "/api/exams", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({
        title: "Exam created",
        description: "Your exam has been created successfully.",
      });
      resetForm();
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create exam. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTitle("");
    setQuestions([]);
    setStartTime("");
    setEndTime("");
    setSelectedStudentIds([]);
    setNewQuestion("");
    setNewQuestionType("short");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
  };

  const addQuestion = () => {
    if (!newQuestion.trim()) return;

    const question: InsertQuestion = {
      text: newQuestion.trim(),
      type: newQuestionType,
      options: newQuestionType === "mcq" ? newQuestionOptions.filter((o) => o.trim()) : undefined,
      correctAnswer: newCorrectAnswer.trim() || undefined,
    };

    setQuestions([...questions, question]);
    setNewQuestion("");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const addOption = () => {
    setNewQuestionOptions([...newQuestionOptions, ""]);
  };

  const updateOption = (index: number, value: string) => {
    const updated = [...newQuestionOptions];
    updated[index] = value;
    setNewQuestionOptions(updated);
  };

  const removeOption = (index: number) => {
    setNewQuestionOptions(newQuestionOptions.filter((_, i) => i !== index));
  };

  const toggleStudent = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const handleSubmit = () => {
    if (!title.trim() || questions.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide an exam title and at least one question.",
        variant: "destructive",
      });
      return;
    }

    createExamMutation.mutate({
      title: title.trim(),
      questions,
      startTime: startTime || null,
      endTime: endTime || null,
      assignedStudentIds: selectedStudentIds,
      professorId: user?.id || "",
    });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create New Exam</DialogTitle>
          <DialogDescription>
            Set up your oral examination with questions and scheduling
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-2 -mr-2" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="exam-title">Exam Title</Label>
              <Input
                id="exam-title"
                placeholder="e.g., Midterm Oral Exam"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-exam-title"
              />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-start-time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-end-time"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Assign Students</Label>
                <span className="text-sm text-muted-foreground">
                  {selectedStudentIds.length} selected
                </span>
              </div>
              {students.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No students registered yet. Students can be assigned after they log in.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {students.map((student) => (
                    <Badge
                      key={student.id}
                      variant={selectedStudentIds.includes(student.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleStudent(student.id)}
                      data-testid={`badge-student-${student.id}`}
                    >
                      <Users className="h-3 w-3 mr-1" />
                      {student.username}
                      {selectedStudentIds.includes(student.id) && (
                        <X className="h-3 w-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Questions ({questions.length})</Label>
              </div>

              {questions.length > 0 && (
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <Card key={i}>
                      <CardContent className="p-3 flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <div className="mt-0.5">{getQuestionIcon(q.type)}</div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{q.text}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="secondary" className="text-xs">
                                {q.type.toUpperCase()}
                              </Badge>
                              {q.options && q.options.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {q.options.length} options
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeQuestion(i)}
                          data-testid={`button-remove-question-${i}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileQuestion className="h-4 w-4" />
                    Add New Question
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="question-text">Question Text</Label>
                    <Textarea
                      id="question-text"
                      placeholder="Enter your question..."
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      data-testid="textarea-question-text"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Question Type</Label>
                      <Select
                        value={newQuestionType}
                        onValueChange={(v) => setNewQuestionType(v as QuestionType)}
                      >
                        <SelectTrigger data-testid="select-question-type">
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
                      <Label htmlFor="correct-answer">Expected Answer</Label>
                      <Input
                        id="correct-answer"
                        placeholder="For auto-grading..."
                        value={newCorrectAnswer}
                        onChange={(e) => setNewCorrectAnswer(e.target.value)}
                        data-testid="input-correct-answer"
                      />
                    </div>
                  </div>

                  {newQuestionType === "mcq" && (
                    <div className="space-y-2">
                      <Label>Answer Options</Label>
                      <div className="space-y-2">
                        {newQuestionOptions.map((opt, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              placeholder={`Option ${i + 1}`}
                              value={opt}
                              onChange={(e) => updateOption(i, e.target.value)}
                              data-testid={`input-option-${i}`}
                            />
                            {newQuestionOptions.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeOption(i)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addOption}
                          data-testid="button-add-option"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Option
                        </Button>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={addQuestion}
                    disabled={!newQuestion.trim()}
                    data-testid="button-add-question"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Question
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || questions.length === 0 || createExamMutation.isPending}
            data-testid="button-create-exam-submit"
          >
            {createExamMutation.isPending ? "Creating..." : "Create Exam"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
