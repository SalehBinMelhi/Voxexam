import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ProfessorVoxScore } from "@/components/voxscore-breakdown";
import { ProfessorDecisionPanel } from "@/components/professor-decision-panel";
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
  Sparkles,
  TrendingUp,
  TrendingDown,
  BookOpen,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Copy,
  RefreshCw,
  Key,
  Download,
  BarChart3,
} from "lucide-react";
import { ShieldAlert } from "lucide-react";
import type { Exam, ExamSubmission, QuestionType, User as UserType, ProctoringFlag } from "@shared/schema";
import { TAB_SWITCH_SUSPICIOUS_THRESHOLD } from "@shared/schema";
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

interface ExamAnalytics {
  examId: string;
  totalStudents: number;
  avgCorrectness: number;
  avgUnderstanding: number;
  students: { studentId: string; name: string | null; avgCorrectness: number; avgUnderstanding: number }[];
}

function AnalyticsSection({ examId, examTitle }: { examId: string; examTitle: string }) {
  const { data: analytics, isLoading, isError } = useQuery<ExamAnalytics>({
    queryKey: ["/api/exams", examId, "analytics"],
    retry: false,
  });

  const handleExportCsv = () => {
    if (!analytics || analytics.students.length === 0) return;
    const header = "studentId,name,avgCorrectness,avgUnderstanding";
    const rows = analytics.students.map(s =>
      `${s.studentId},"${(s.name || "").replace(/"/g, '""')}",${s.avgCorrectness},${s.avgUnderstanding}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${examTitle.replace(/[^a-zA-Z0-9]/g, "_")}-analytics.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="section-analytics">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </h4>
        <div className="space-y-2">
          <div className="h-4 w-48 bg-muted animate-pulse rounded" />
          <div className="h-32 w-full bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3" data-testid="section-analytics">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </h4>
        <p className="text-xs text-muted-foreground">Unable to load analytics.</p>
      </div>
    );
  }

  if (!analytics || analytics.totalStudents === 0) {
    return (
      <div className="space-y-3" data-testid="section-analytics">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </h4>
        <p className="text-xs text-muted-foreground">No submissions to analyze yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="section-analytics">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Analytics
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          className="h-7 text-xs"
          data-testid="button-export-csv"
        >
          <Download className="h-3 w-3 mr-1" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-md p-2 text-center">
          <p className="text-lg font-semibold" data-testid="text-analytics-total-students">{analytics.totalStudents}</p>
          <p className="text-xs text-muted-foreground">Students</p>
        </div>
        <div className="bg-muted/50 rounded-md p-2 text-center">
          <p className={`text-lg font-semibold ${getScoreColor(analytics.avgCorrectness)}`} data-testid="text-analytics-avg-correctness">
            {(analytics.avgCorrectness * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">Avg Correctness</p>
        </div>
        <div className="bg-muted/50 rounded-md p-2 text-center">
          <p className={`text-lg font-semibold ${getScoreColor(analytics.avgUnderstanding)}`} data-testid="text-analytics-avg-understanding">
            {(analytics.avgUnderstanding * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-muted-foreground">Avg Understanding</p>
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs" data-testid="table-analytics">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-3 py-2 font-medium">Student</th>
              <th className="text-right px-3 py-2 font-medium">Correctness</th>
              <th className="text-right px-3 py-2 font-medium">Understanding</th>
            </tr>
          </thead>
          <tbody>
            {analytics.students.map((student) => (
              <tr key={student.studentId} className="border-b last:border-b-0" data-testid={`row-analytics-${student.studentId}`}>
                <td className="px-3 py-2" data-testid={`text-student-name-${student.studentId}`}>
                  <span className="font-medium">{student.name || student.studentId}</span>
                </td>
                <td className={`text-right px-3 py-2 ${getScoreColor(student.avgCorrectness)}`} data-testid={`text-student-correctness-${student.studentId}`}>
                  {(student.avgCorrectness * 100).toFixed(0)}%
                </td>
                <td className={`text-right px-3 py-2 ${getScoreColor(student.avgUnderstanding)}`} data-testid={`text-student-understanding-${student.studentId}`}>
                  {(student.avgUnderstanding * 100).toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [openVoxBreakdowns, setOpenVoxBreakdowns] = useState<Record<string, boolean>>({});

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

  const regenerateCodeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/exams/${exam.id}/regenerate-code`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({
        title: "Code regenerated",
        description: "A new exam access code has been generated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to regenerate code.",
        variant: "destructive",
      });
    },
  });

  const copyAccessCode = () => {
    if (exam.accessCode) {
      navigator.clipboard.writeText(exam.accessCode);
      toast({ title: "Copied", description: "Exam code copied to clipboard." });
    }
  };

  const getAccessCodeStatus = () => {
    if (!exam.accessCode) return null;
    if (!exam.accessCodeExpiresAt) return { active: true, label: "Active" };
    const expiresAt = new Date(exam.accessCodeExpiresAt);
    const now = new Date();
    if (isAfter(expiresAt, now)) {
      const diffMs = expiresAt.getTime() - now.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const remainingMins = diffMins % 60;
      const timeRemaining = diffHours > 0 ? `${diffHours}h ${remainingMins}m remaining` : `${diffMins}m remaining`;
      return { active: true, label: "Active", timeRemaining };
    }
    return { active: false, label: "Expired" };
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
              {examSubmissions.length > 0 && exam.mode !== "quickvox" && (
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

            {exam.accessCode && (
              <div className="space-y-2" data-testid="section-exam-code">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Exam Code
                </h4>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-lg font-mono font-bold bg-muted px-3 py-1.5 rounded-md tracking-widest" data-testid="text-access-code">
                    {exam.accessCode}
                  </code>
                  <Button variant="outline" size="icon" onClick={copyAccessCode} data-testid="button-copy-access-code">
                    <Copy className="h-4 w-4" />
                  </Button>
                  {(() => {
                    const codeStatus = getAccessCodeStatus();
                    if (!codeStatus) return null;
                    return codeStatus.active ? (
                      <Badge variant="default" className="bg-green-600 text-white no-default-hover-elevate no-default-active-elevate" data-testid="badge-code-status">
                        Active
                        {codeStatus.timeRemaining && <span className="ml-1 opacity-80">({codeStatus.timeRemaining})</span>}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="no-default-hover-elevate no-default-active-elevate" data-testid="badge-code-status">
                        Expired
                      </Badge>
                    );
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regenerateCodeMutation.mutate()}
                    disabled={regenerateCodeMutation.isPending}
                    data-testid="button-regenerate-code"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${regenerateCodeMutation.isPending ? "animate-spin" : ""}`} />
                    {regenerateCodeMutation.isPending ? "Regenerating..." : "Regenerate Code"}
                  </Button>
                </div>
              </div>
            )}

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

            <AnalyticsSection examId={exam.id} examTitle={exam.title} />

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

            {examSubmissions.length === 0 && (
              <>
                <Separator />
                <div className="rounded-md border border-dashed p-6 text-center" data-testid="empty-submissions">
                  <p className="text-sm text-muted-foreground">No submissions yet.</p>
                </div>
              </>
            )}

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
                      const recordingUploadFailed = sub.proctoringUploadStatus === "upload_failed";
                      const suspicious = sub.isSuspicious === "true" || (sub.tabSwitchCount || 0) >= TAB_SWITCH_SUSPICIOUS_THRESHOLD;

                      return (
                        <Card key={sub.id} data-testid={`submission-card-${sub.id}`} className={suspicious || recordingUploadFailed ? "border-red-500 dark:border-red-600" : hasProctoringIssues ? "border-amber-400 dark:border-amber-600" : ""}>
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
                                    {suspicious && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px] font-medium" data-testid={`badge-suspicious-${sub.id}`}>
                                        <ShieldAlert className="h-3 w-3" />
                                        Suspicious
                                      </span>
                                    )}
                                    {hasProctoringIssues && !suspicious && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-medium" data-testid={`badge-proctoring-${sub.id}`}>
                                        <AlertTriangle className="h-3 w-3" />
                                        {sub.tabSwitchCount || proctoringFlags.length} switch{(sub.tabSwitchCount || proctoringFlags.length) !== 1 ? "es" : ""}
                                      </span>
                                    )}
                                    {recordingUploadFailed && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 text-[10px] font-medium" data-testid={`badge-recording-upload-failed-${sub.id}`}>
                                        <AlertTriangle className="h-3 w-3" />
                                        Recording upload failed / فشل رفع التسجيل
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(parseISO(sub.submittedAt), "MMM d, yyyy h:mm a")}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 max-w-[60%]">
                                {exam.mode === "quickvox" ? (
                                  <>
                                    <div
                                      className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20 flex-shrink-0"
                                      data-testid={`badge-quickvox-${sub.id}`}
                                    >
                                      QuickVox
                                    </div>
                                    {sub.quickvoxInsight && (
                                      <p
                                        className="text-xs text-muted-foreground line-clamp-2 text-left"
                                        data-testid={`text-quickvox-insight-${sub.id}`}
                                      >
                                        {sub.quickvoxInsight}
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(sub.totalScore)} ${getScoreColor(sub.totalScore)}`} data-testid={`badge-correctness-${sub.id}`}>
                                      Correctness: {(sub.totalScore * 100).toFixed(0)}%
                                    </div>
                                    {sub.totalUnderstandingScore != null && (
                                      <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(sub.totalUnderstandingScore)} ${getScoreColor(sub.totalUnderstandingScore)}`} data-testid={`badge-understanding-${sub.id}`}>
                                        Understanding: {(sub.totalUnderstandingScore * 100).toFixed(0)}%
                                      </div>
                                    )}
                                  </>
                                )}
                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t px-4 pb-4 space-y-4">
                                {exam.mode === "quickvox" && (sub.quickvoxInsight || sub.quickvoxFollowUp) && (
                                  <div className="mt-4 space-y-3" data-testid={`quickvox-section-${sub.id}`}>
                                    <h5 className="text-xs font-semibold flex items-center gap-1.5 text-primary">
                                      <Sparkles className="h-3.5 w-3.5" />
                                      QuickVox Insight
                                    </h5>
                                    {sub.quickvoxInsight && (
                                      <Card className="border-primary/20 bg-primary/5">
                                        <CardContent className="p-3">
                                          <p className="text-xs leading-relaxed" data-testid={`text-quickvox-insight-expanded-${sub.id}`}>
                                            {sub.quickvoxInsight}
                                          </p>
                                        </CardContent>
                                      </Card>
                                    )}
                                    {sub.quickvoxFollowUp && (
                                      <div
                                        className="rounded-md bg-primary/5 border border-primary/20 p-3"
                                        data-testid={`callout-quickvox-followup-${sub.id}`}
                                      >
                                        <p className="text-[10px] font-medium text-primary uppercase tracking-wide mb-1">
                                          One more thought:
                                        </p>
                                        <p className="text-xs leading-relaxed" data-testid={`text-quickvox-followup-${sub.id}`}>
                                          {sub.quickvoxFollowUp}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {exam.mode !== "quickvox" && sub.voxScoreProfile && (
                                  <ProfessorVoxScore
                                    profile={sub.voxScoreProfile}
                                    open={openVoxBreakdowns[sub.id] ?? true}
                                    onToggle={() =>
                                      setOpenVoxBreakdowns((prev) => ({
                                        ...prev,
                                        [sub.id]: !(prev[sub.id] ?? true),
                                      }))
                                    }
                                    onViewEvidence={() =>
                                      setOpenVoxBreakdowns((prev) => ({
                                        ...prev,
                                        [sub.id]: true,
                                      }))
                                    }
                                    testId={sub.id}
                                  />
                                )}

                                {exam.mode !== "quickvox" && feedback && (
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

                                {exam.mode !== "quickvox" && !feedback && (
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
                                            {exam.mode === "quickvox" ? null : (
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

                                {exam.mode !== "quickvox" && (
                                  <ProfessorDecisionPanel
                                    exam={exam}
                                    submission={sub}
                                    onViewEvidence={() =>
                                      setOpenVoxBreakdowns((prev) => ({
                                        ...prev,
                                        [sub.id]: true,
                                      }))
                                    }
                                  />
                                )}

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
