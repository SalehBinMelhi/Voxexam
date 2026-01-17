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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import type { Exam, ExamSubmission, QuestionType, User as UserType } from "@shared/schema";
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

export function ExamDetailsDialog({
  exam,
  open,
  onOpenChange,
}: ExamDetailsDialogProps) {
  const { toast } = useToast();

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const { data: submissions = [] } = useQuery<ExamSubmission[]>({
    queryKey: ["/api/submissions"],
  });

  const examSubmissions = submissions.filter((s) => s.examId === exam.id);
  const assignedStudents = allUsers.filter((u) =>
    exam.assignedStudentIds.includes(u.id)
  );

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
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

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                      <Calendar className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Schedule</p>
                      {exam.startTime && exam.endTime ? (
                        <p className="text-xs text-muted-foreground">
                          {format(parseISO(exam.startTime), "MMM d, h:mm a")} -{" "}
                          {format(parseISO(exam.endTime), "h:mm a")}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Not scheduled
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                      <Trophy className="h-5 w-5 text-chart-2" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Submissions</p>
                      <p className="text-xs text-muted-foreground">
                        {examSubmissions.length} of{" "}
                        {exam.assignedStudentIds.length} students
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Assigned Students ({assignedStudents.length})
              </h4>
              {assignedStudents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No students assigned to this exam.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {assignedStudents.map((student) => {
                    const hasSubmitted = examSubmissions.some(
                      (s) => s.studentId === student.id
                    );
                    const submission = examSubmissions.find(
                      (s) => s.studentId === student.id
                    );
                    return (
                      <Badge
                        key={student.id}
                        variant={hasSubmitted ? "default" : "outline"}
                      >
                        <User className="h-3 w-3 mr-1" />
                        {student.username}
                        {hasSubmitted && submission && (
                          <span className="ml-1">
                            ({(submission.totalScore * 100).toFixed(0)}%)
                          </span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="font-medium">Questions</h4>
              <div className="space-y-2">
                {exam.questions.map((q, i) => (
                  <Card key={q.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-sm font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{q.text}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {getQuestionIcon(q.type)}
                              <span className="ml-1">
                                {q.type.toUpperCase()}
                              </span>
                            </Badge>
                            {q.options && q.options.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {q.options.length} options
                              </span>
                            )}
                          </div>
                          {q.options && q.options.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {q.options.map((opt, j) => (
                                <p
                                  key={j}
                                  className={`text-sm pl-4 ${
                                    opt === q.correctAnswer
                                      ? "text-chart-2 font-medium"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  {j + 1}. {opt}
                                  {opt === q.correctAnswer && " (correct)"}
                                </p>
                              ))}
                            </div>
                          )}
                          {q.correctAnswer &&
                            q.type !== "mcq" && (
                              <p className="text-sm text-muted-foreground mt-2">
                                Expected: {q.correctAnswer}
                              </p>
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
                <div className="space-y-3">
                  <h4 className="font-medium">Submission Results</h4>
                  <div className="space-y-2">
                    {examSubmissions.map((sub) => {
                      const student = allUsers.find(
                        (u) => u.id === sub.studentId
                      );
                      return (
                        <Card key={sub.id}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium">
                                    {student?.username || "Unknown Student"}
                                  </p>
                                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(
                                      parseISO(sub.submittedAt),
                                      "MMM d, yyyy h:mm a"
                                    )}
                                  </p>
                                </div>
                              </div>
                              <Badge
                                variant={
                                  sub.totalScore >= 0.7
                                    ? "default"
                                    : sub.totalScore >= 0.5
                                    ? "secondary"
                                    : "destructive"
                                }
                              >
                                {(sub.totalScore * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
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
