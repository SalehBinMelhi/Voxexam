import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Plus, Trash2, X, FileQuestion, Mic, MessageSquare, ListChecks, Users, Sparkles, Pencil, GripVertical } from "lucide-react";
import type { InsertQuestion, QuestionType, Class } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExamDialog({ open, onOpenChange }: CreateExamDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<InsertQuestion[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [manualStudentNames, setManualStudentNames] = useState<string[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [aiInstructions, setAiInstructions] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [newQuestion, setNewQuestion] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>("short");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([""]);
  const [newCorrectAnswer, setNewCorrectAnswer] = useState("");

  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: classEnrollments = [] } = useQuery<Array<{ id: string; studentId: string; classId: string; student?: { id: string; email?: string; firstName?: string; lastName?: string } }>>({
    queryKey: ["/api/classes", selectedClassId, "enrollments"],
    enabled: !!selectedClassId && selectedClassId !== "none",
  });

  const createExamMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      questions: InsertQuestion[];
      startTime: string | null;
      endTime: string | null;
      classId: string | null;
      assignedStudentNames: string[];
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

  const generateQuestionsMutation = useMutation({
    mutationFn: async ({ classId, instructions }: { classId: string; instructions?: string }) => {
      const response = await apiRequest("POST", "/api/generate-questions", {
        classId,
        instructions: instructions || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.questions && data.questions.length > 0) {
        const newQuestions: InsertQuestion[] = data.questions.map((q: any) => ({
          text: q.text,
          type: q.type as QuestionType,
          options: q.options || undefined,
          correctAnswer: q.correctAnswer || undefined,
        }));
        setQuestions((prev) => [...prev, ...newQuestions]);
        toast({
          title: "Questions generated",
          description: `${data.questions.length} questions were generated from your class materials. Review and edit them below.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Generation failed",
        description: err.message || "Could not generate questions. Make sure you have uploaded materials for the selected class.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setTitle("");
    setQuestions([]);
    setStartTime("");
    setEndTime("");
    setSelectedClassId("");
    setManualStudentNames([]);
    setNewStudentName("");
    setNewQuestion("");
    setNewQuestionType("short");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
    setEditingIndex(null);
    setAiInstructions("");
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

  const addAllClassStudents = () => {
    const newNames: string[] = [];
    for (const enrollment of classEnrollments) {
      const student = enrollment.student;
      if (!student) continue;
      const name = student.firstName
        ? `${student.firstName} ${student.lastName || ""}`.trim()
        : student.email || "";
      if (name && !manualStudentNames.includes(name)) {
        newNames.push(name);
      }
    }
    if (newNames.length > 0) {
      setManualStudentNames([...manualStudentNames, ...newNames]);
      toast({
        title: "Students added",
        description: `${newNames.length} student${newNames.length !== 1 ? "s" : ""} from the class have been added.`,
      });
    } else {
      toast({
        title: "No new students",
        description: "All enrolled students are already assigned, or no students are enrolled in this class.",
      });
    }
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

  const updateQuestionType = (index: number, type: QuestionType) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], type };
    if (type !== "mcq") {
      updated[index].options = undefined;
    }
    setQuestions(updated);
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
      classId: selectedClassId && selectedClassId !== "none" ? selectedClassId : null,
      assignedStudentNames: manualStudentNames,
    });
  };

  const handleGenerateQuestions = () => {
    const classId = selectedClassId && selectedClassId !== "none" ? selectedClassId : null;
    if (!classId) {
      toast({
        title: "Select a class",
        description: "Please select a class first. The AI generates questions from the class materials you've uploaded.",
        variant: "destructive",
      });
      return;
    }
    generateQuestionsMutation.mutate({
      classId,
      instructions: aiInstructions.trim() || undefined,
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

  const getTypeLabel = (type: QuestionType) => {
    switch (type) {
      case "mcq": return "Multiple Choice";
      case "audio": return "Audio Response";
      default: return "Short Answer";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Create New Exam</DialogTitle>
          <DialogDescription>
            Set up your examination with questions — add your own or let AI generate them from your class materials
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

            {classes.length > 0 && (
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger data-testid="select-class">
                    <SelectValue placeholder="Select a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No class</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select a class to enable AI question generation from uploaded materials</p>
              </div>
            )}

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
                <Label>Assign Students (by name/email)</Label>
                <div className="flex items-center gap-2">
                  {selectedClassId && selectedClassId !== "none" && classEnrollments.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addAllClassStudents}
                      data-testid="button-add-all-class-students"
                    >
                      <Users className="h-3.5 w-3.5 mr-1" />
                      Add all class students ({classEnrollments.length})
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {manualStudentNames.length} assigned
                  </span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Input
                  placeholder="Enter student name or email..."
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addStudentName();
                    }
                  }}
                  data-testid="input-student-name"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addStudentName}
                  disabled={!newStudentName.trim()}
                  data-testid="button-add-student"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {manualStudentNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {manualStudentNames.map((name) => (
                    <Badge
                      key={name}
                      variant="default"
                      className="cursor-pointer"
                      onClick={() => removeStudentName(name)}
                      data-testid={`badge-manual-student-${name}`}
                    >
                      <Users className="h-3 w-3 mr-1" />
                      {name}
                      <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Questions ({questions.length})</Label>
                {selectedClassId && selectedClassId !== "none" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerateQuestions}
                    disabled={generateQuestionsMutation.isPending}
                    data-testid="button-generate-questions"
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    {generateQuestionsMutation.isPending ? "Generating..." : "AI Generate"}
                  </Button>
                )}
              </div>

              {selectedClassId && selectedClassId !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="ai-instructions">Instructions for AI (optional)</Label>
                  <Textarea
                    id="ai-instructions"
                    placeholder="e.g., Give me 3 questions on chapter 3, make them hard, focus on critical thinking..."
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    className="min-h-[60px]"
                    data-testid="textarea-ai-instructions"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tell the AI how many questions, topics to focus on, difficulty level, question style, etc. Defaults to 5 questions if not specified.
                  </p>
                </div>
              )}

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
                              {q.correctAnswer && (
                                <p className="text-xs text-muted-foreground mt-1 break-words">
                                  Expected: {q.correctAnswer}
                                </p>
                              )}
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
                            <Select
                              value={q.type}
                              onValueChange={(v) => updateQuestionType(i, v as QuestionType)}
                            >
                              <SelectTrigger className="h-7 w-[110px] text-xs" data-testid={`select-type-${i}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="short">Short Answer</SelectItem>
                                <SelectItem value="mcq">MCQ</SelectItem>
                                <SelectItem value="audio">Audio</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => editQuestion(i)}
                              data-testid={`button-edit-question-${i}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeQuestion(i)}
                              data-testid={`button-remove-question-${i}`}
                            >
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
                    {editingIndex !== null ? "Edit Question" : "Add New Question"}
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

                  <div className="flex gap-2">
                    <Button
                      onClick={addQuestion}
                      disabled={!newQuestion.trim()}
                      data-testid="button-add-question"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {editingIndex !== null ? "Save Changes" : "Add Question"}
                    </Button>
                    {editingIndex !== null && (
                      <Button variant="outline" onClick={cancelEdit} data-testid="button-cancel-edit">
                        Cancel
                      </Button>
                    )}
                  </div>
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
