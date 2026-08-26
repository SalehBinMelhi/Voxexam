import { useState, useRef, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, X, FileQuestion, Mic, MessageSquare, ListChecks, Users, Sparkles, Pencil, GripVertical, ChevronDown, ChevronUp, Send, Bot, User, RotateCcw, Key, Copy } from "lucide-react";
import type { InsertQuestion, QuestionType, Class } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface CreateExamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateExamDialog({ open, onOpenChange }: CreateExamDialogProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<InsertQuestion[]>([]);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [manualStudentNames, setManualStudentNames] = useState<string[]>([]);
  const [newStudentName, setNewStudentName] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [autoGenerateCode, setAutoGenerateCode] = useState(true);
  const [customAccessCode, setCustomAccessCode] = useState("");

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

  const selectedClassData = classes.find(c => c.id === selectedClassId);
  const classRoster = selectedClassData?.roster || [];

  const allClassStudents: string[] = [];
  for (const name of classRoster) {
    if (name && !allClassStudents.includes(name)) allClassStudents.push(name);
  }
  for (const enrollment of classEnrollments) {
    const student = enrollment.student;
    if (!student) continue;
    const name = student.firstName
      ? `${student.firstName} ${student.lastName || ""}`.trim()
      : student.email || "";
    if (name && !allClassStudents.includes(name)) allClassStudents.push(name);
  }

  const createExamMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      questions: InsertQuestion[];
      startTime: string | null;
      endTime: string | null;
      classId: string | null;
      assignedStudentNames: string[];
      autoGenerateCode?: boolean;
      customAccessCode?: string;
    }) => {
      const response = await apiRequest("POST", "/api/exams", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      const generatedCode = data?.accessCode;
      if (generatedCode) {
        toast({
          title: "Exam created",
          description: `Exam code: ${generatedCode} (copied to clipboard)`,
          duration: 8000,
        });
        navigator.clipboard.writeText(generatedCode).catch(() => {});
      } else {
        toast({
          title: "Exam created",
          description: "Your exam has been created successfully.",
        });
      }
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

  const aiChatMutation = useMutation({
    mutationFn: async ({ classId, messages }: { classId: string; messages: ChatMessage[] }) => {
      const response = await apiRequest("POST", "/api/ai-question-chat", {
        classId,
        messages,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
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
          description: `${data.questions.length} questions have been added. Review and edit them below.`,
        });
      }
    },
    onError: (err: Error) => {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
      toast({
        title: "AI error",
        description: err.message || "Could not communicate with the AI assistant.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const resetForm = () => {
    setTitle("");
    setQuestions([]);
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setSelectedClassId("");
    setManualStudentNames([]);
    setNewStudentName("");
    setNewQuestion("");
    setNewQuestionType("short");
    setNewQuestionOptions([""]);
    setNewCorrectAnswer("");
    setEditingIndex(null);
    setStudentPickerOpen(false);
    setAiChatOpen(false);
    setChatMessages([]);
    setChatInput("");
    setAutoGenerateCode(true);
    setCustomAccessCode("");
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
    const newNames = allClassStudents.filter(n => !manualStudentNames.includes(n));
    if (newNames.length > 0) {
      setManualStudentNames([...manualStudentNames, ...newNames]);
      toast({
        title: "Students added",
        description: `${newNames.length} student${newNames.length !== 1 ? "s" : ""} from the class have been added.`,
      });
    } else {
      toast({
        title: "No new students",
        description: "All class students are already assigned.",
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
      startTime: startDate ? `${startDate}T${startTime || "00:00"}` : null,
      endTime: endDate ? `${endDate}T${endTime || "23:59"}` : null,
      classId: selectedClassId && selectedClassId !== "none" ? selectedClassId : null,
      assignedStudentNames: manualStudentNames,
      ...(autoGenerateCode ? { autoGenerateCode: true } : customAccessCode.trim() ? { customAccessCode: customAccessCode.trim() } : {}),
    });
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    const classId = selectedClassId && selectedClassId !== "none" ? selectedClassId : null;
    if (!classId) return;

    const updatedMessages: ChatMessage[] = [...chatMessages, { role: "user", content: text }];
    setChatMessages(updatedMessages);
    setChatInput("");

    aiChatMutation.mutate({ classId, messages: updatedMessages });
  };

  const handleStartAiChat = () => {
    const classId = selectedClassId && selectedClassId !== "none" ? selectedClassId : null;
    if (!classId) {
      toast({
        title: "Select a class",
        description: "Please select a class first. The AI generates questions from the class materials you've uploaded.",
        variant: "destructive",
      });
      return;
    }
    setAiChatOpen(true);
    setChatMessages([]);
    setChatInput("");
  };

  const handleResetChat = () => {
    setChatMessages([]);
    setChatInput("");
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
              <Label htmlFor="exam-title">Exam Title <span className="text-red-500">*</span></Label>
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
                      <SelectItem key={cls.id} value={cls.id}>{cls.subjectName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select a class to enable AI question generation from uploaded materials</p>
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Start (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1"
                    data-testid="input-start-date"
                  />
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-[120px]"
                    data-testid="input-start-time"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>End (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1"
                    data-testid="input-end-date"
                  />
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-[120px]"
                    data-testid="input-end-time"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Exam Code</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="auto-generate-code"
                  checked={autoGenerateCode}
                  onCheckedChange={(checked) => {
                    setAutoGenerateCode(checked === true);
                    if (checked) setCustomAccessCode("");
                  }}
                  data-testid="checkbox-auto-generate-code"
                />
                <Label htmlFor="auto-generate-code" className="text-sm cursor-pointer">
                  Auto-generate 5-digit code
                </Label>
              </div>
              {!autoGenerateCode && (
                <div className="space-y-1.5">
                  <Label htmlFor="custom-access-code">Custom Code</Label>
                  <Input
                    id="custom-access-code"
                    placeholder="Enter custom code (max 10 chars)"
                    value={customAccessCode}
                    onChange={(e) => setCustomAccessCode(e.target.value.slice(0, 10))}
                    maxLength={10}
                    data-testid="input-custom-access-code"
                  />
                  <p className="text-xs text-muted-foreground">{customAccessCode.length}/10 characters</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Assign Students</Label>
                <span className="text-sm text-muted-foreground">
                  {manualStudentNames.length} assigned
                </span>
              </div>

              {selectedClassId && selectedClassId !== "none" && allClassStudents.length > 0 && (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 border rounded-md hover:bg-muted/50 transition-colors text-left"
                    onClick={() => setStudentPickerOpen(!studentPickerOpen)}
                    data-testid="button-toggle-student-picker"
                  >
                    <span className="text-sm">
                      {manualStudentNames.length > 0
                        ? `${manualStudentNames.length} of ${allClassStudents.length} students selected`
                        : `Select from ${allClassStudents.length} class students`}
                    </span>
                    {studentPickerOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {studentPickerOpen && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={addAllClassStudents}
                          data-testid="button-add-all-class-students"
                        >
                          <Users className="h-3.5 w-3.5 mr-1" />
                          Add All ({allClassStudents.length})
                        </Button>
                        {manualStudentNames.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setManualStudentNames([])}
                            data-testid="button-remove-all-students"
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Remove All
                          </Button>
                        )}
                      </div>
                      <div className="border rounded-md divide-y max-h-[200px] overflow-y-auto">
                        {allClassStudents.map((studentName) => {
                          const isSelected = manualStudentNames.includes(studentName);
                          return (
                            <label
                              key={studentName}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                              data-testid={`label-student-${studentName}`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    removeStudentName(studentName);
                                  } else {
                                    setManualStudentNames([...manualStudentNames, studentName]);
                                  }
                                }}
                                className="rounded border-gray-300"
                                data-testid={`checkbox-student-${studentName}`}
                              />
                              <p className="text-sm font-medium truncate flex-1">{studentName}</p>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(!selectedClassId || selectedClassId === "none" || allClassStudents.length === 0) && (
                <p className="text-xs text-muted-foreground">Select a class above to see class students, or add students manually below.</p>
              )}

              <div className="flex gap-2">
                <Input
                  placeholder="Add student by name or email..."
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
                <Label>Questions ({questions.length}) <span className="text-red-500">*</span></Label>
                {selectedClassId && selectedClassId !== "none" && !aiChatOpen && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleStartAiChat}
                    data-testid="button-start-ai-chat"
                  >
                    <Sparkles className="h-4 w-4 mr-1" />
                    AI Generate
                  </Button>
                )}
              </div>

              {aiChatOpen && selectedClassId && selectedClassId !== "none" && (
                <Card className="border-primary/20 bg-primary/[0.02]">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        AI Question Assistant
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        {chatMessages.length > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleResetChat}
                            title="Start over"
                            data-testid="button-reset-chat"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setAiChatOpen(false)}
                          title="Close"
                          data-testid="button-close-ai-chat"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-3">
                    {chatMessages.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Describe what kind of questions you want. The AI will ask you clarifying questions to make sure it gets it right.
                      </p>
                    )}

                    {chatMessages.length > 0 && (
                      <div className="space-y-2 max-h-[200px] overflow-y-auto rounded-md border bg-background p-2" data-testid="ai-chat-messages">
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                          >
                            {msg.role === "assistant" && (
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Bot className="h-3.5 w-3.5 text-primary" />
                                </div>
                              </div>
                            )}
                            <div
                              className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${
                                msg.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted"
                              }`}
                              data-testid={`chat-message-${msg.role}-${i}`}
                            >
                              {msg.content}
                            </div>
                            {msg.role === "user" && (
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                                  <User className="h-3.5 w-3.5" />
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                        {aiChatMutation.isPending && (
                          <div className="flex gap-2 justify-start">
                            <div className="flex-shrink-0 mt-0.5">
                              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <Bot className="h-3.5 w-3.5 text-primary" />
                              </div>
                            </div>
                            <div className="text-sm rounded-lg px-3 py-2 bg-muted text-muted-foreground italic">
                              Thinking...
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Input
                        placeholder={chatMessages.length === 0 ? "e.g., I want one oral question about phonemes..." : "Reply to the AI..."}
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendChat();
                          }
                        }}
                        disabled={aiChatMutation.isPending}
                        data-testid="input-ai-chat"
                      />
                      <Button
                        size="icon"
                        onClick={handleSendChat}
                        disabled={!chatInput.trim() || aiChatMutation.isPending}
                        data-testid="button-send-ai-chat"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
