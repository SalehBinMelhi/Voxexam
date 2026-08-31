import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { TakeExamDialog } from "@/components/take-exam-dialog";
import { VoxPracticeDialog } from "@/components/voxpractice-dialog";
import { AdaptiveExamDialog } from "@/components/adaptive-exam-dialog";
import { HelpSupportPopover } from "@/components/help-support-popover";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  History,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Mic,
  PlayCircle,
  RotateCw,
  School,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";
import {
  shouldScrollStudentExamFrame,
  STUDENT_EXAM_VISIBLE_LIMIT,
  studentClassLeaveLabel,
  studentExamFrameItems,
} from "@/lib/student-dashboard-utils";
import type {
  StudentClassExamsData,
  StudentClassSummary,
  StudentDashboardData,
  StudentExamAccessData,
  StudentExamHistoryItem,
  StudentExamSummary,
} from "@shared/student-experience";

interface ApiEnvelope<T> {
  data: T;
}

interface JoinClassData {
  class: StudentClassSummary;
  alreadyJoined?: boolean;
  message?: string;
}

interface JoinExamData {
  exam: StudentExamSummary;
  message?: string;
}

interface LeaveClassData {
  classId: string;
  message?: string;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.error === "string") return payload.error;
    if (typeof payload?.message === "string") return payload.message;
  } catch {
    // A generic message is safer than exposing an unexpected response body.
  }
  return fallback;
}

async function requestData<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, "The request could not be completed."));
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!payload || payload.data === undefined) {
    throw new Error("The server returned an invalid response.");
  }
  return payload.data;
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : format(date, "MMM d, yyyy, h:mm a");
}

function examPeriod(exam: StudentExamSummary): string | null {
  if (exam.startTime && exam.endTime) {
    return `${displayDate(exam.startTime)} – ${displayDate(exam.endTime)}`;
  }
  if (exam.startTime) return `Starts ${displayDate(exam.startTime)}`;
  if (exam.endTime) return `Available until ${displayDate(exam.endTime)}`;
  return null;
}

function statusLabel(status: StudentExamSummary["status"]): string {
  switch (status) {
    case "upcoming":
      return "Upcoming";
    case "available":
      return "Available";
    case "completed":
      return "Completed";
    case "closed":
      return "Closed";
  }
}

function statusVariant(status: StudentExamSummary["status"]): "default" | "secondary" | "outline" {
  if (status === "available") return "default";
  if (status === "upcoming") return "outline";
  return "secondary";
}

function attemptLabel(status: StudentExamSummary["attemptStatus"]): string {
  switch (status) {
    case "not_started":
      return "Not started";
    case "in_progress":
      return "In progress";
    case "submitted":
      return "Submitted";
    case "published":
      return "Result published";
  }
}

function examDisplayPriority(exam: StudentExamSummary): number {
  if (exam.status === "available") return 0;
  if (exam.status === "upcoming") return 1;
  if (exam.attemptStatus === "submitted") return 2;
  if (exam.attemptStatus === "published") return 3;
  return 4;
}

function examSortDistance(exam: StudentExamSummary, now: number): number {
  const value = exam.startTime || exam.endTime;
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : Math.abs(timestamp - now);
}

function compareStudentExams(a: StudentExamSummary, b: StudentExamSummary, now: number): number {
  const statusDifference = examDisplayPriority(a) - examDisplayPriority(b);
  if (statusDifference !== 0) return statusDifference;

  if (a.status === "available" && b.status === "available") {
    const aInProgress = a.attemptStatus === "in_progress" ? 0 : 1;
    const bInProgress = b.attemptStatus === "in_progress" ? 0 : 1;
    if (aInProgress !== bInProgress) return aInProgress - bInProgress;
  }

  const timeDifference = examSortDistance(a, now) - examSortDistance(b, now);
  if (timeDifference !== 0) return timeDifference;
  return a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
}

interface ExamInteractionProps {
  openingExamId: string | null;
  onExamAction: (exam: StudentExamSummary) => void;
  onRetryExam: (examId: string) => void;
}

function StudentExamCard({
  exam,
  openingExamId,
  onExamAction,
  onRetryExam,
}: { exam: StudentExamSummary } & ExamInteractionProps) {
  const period = examPeriod(exam);
  const canAct = exam.action === "start" || exam.action === "continue" || exam.action === "view_result";
  const opening = openingExamId === exam.id;
  const buttonLabel = exam.action === "opens_at" && exam.startTime
    ? `Starts ${displayDate(exam.startTime)}`
    : exam.actionLabel;

  return (
    <Card className="flex h-full flex-col" data-testid={`student-exam-${exam.id}`}>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="line-clamp-2 text-lg">{exam.title}</CardTitle>
            {exam.description && <CardDescription className="line-clamp-2">{exam.description}</CardDescription>}
          </div>
          <Badge variant={statusVariant(exam.status)}>{statusLabel(exam.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <div className="space-y-2 text-sm text-muted-foreground">
          {exam.className && <p className="flex items-center gap-2"><School className="h-4 w-4 flex-shrink-0" /><span>{exam.className}</span></p>}
          {exam.professorName && <p className="flex items-center gap-2"><UserRound className="h-4 w-4 flex-shrink-0" /><span>{exam.professorName}</span></p>}
          {period && <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 flex-shrink-0" /><span>{period}</span></p>}
          {exam.durationMinutes != null && <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 flex-shrink-0" /><span>{exam.durationMinutes} minutes</span></p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline">{attemptLabel(exam.attemptStatus)}</Badge>
            <Badge variant="outline">Attempts {exam.attemptsUsed}/{exam.maxAttempts}</Badge>
          </div>
        </div>
        <div className="space-y-2">
          <Button
            className="w-full"
            variant={exam.action === "view_result" ? "outline" : "default"}
            disabled={!canAct || opening}
            onClick={() => onExamAction(exam)}
            title={exam.disabledReason || undefined}
            data-testid={`button-exam-action-${exam.id}`}
          >
            {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : exam.action === "view_result" ? <FileText className="mr-2 h-4 w-4" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            {opening ? "Opening exam..." : buttonLabel}
          </Button>
          {exam.canStartAnotherAttempt && (
            <Button
              className="w-full"
              variant="outline"
              disabled={opening}
              onClick={() => onRetryExam(exam.id)}
              data-testid={`button-exam-retry-${exam.id}`}
            >
              {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              {opening ? "Opening exam..." : "Start Another Attempt"}
            </Button>
          )}
          {!canAct && exam.disabledReason && <p className="text-center text-xs text-muted-foreground">{exam.disabledReason}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function useMeasuredExamFrameHeight(examIds: string[], scrollable: boolean) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const examKey = examIds.join("|");

  const setItemRef = useCallback((index: number, element: HTMLDivElement | null) => {
    if (index < STUDENT_EXAM_VISIBLE_LIMIT) itemRefs.current[index] = element;
  }, []);

  useLayoutEffect(() => {
    if (!scrollable) {
      setMaxHeight(null);
      return;
    }

    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const items = itemRefs.current
        .slice(0, STUDENT_EXAM_VISIBLE_LIMIT)
        .filter((item): item is HTMLDivElement => item !== null);
      if (items.length !== STUDENT_EXAM_VISIBLE_LIMIT) return;

      const styles = window.getComputedStyle(grid);
      const columns = styles.gridTemplateColumns === "none"
        ? 1
        : Math.max(1, styles.gridTemplateColumns.split(/\s+/).filter(Boolean).length);
      const rowGap = Number.parseFloat(styles.rowGap) || 0;
      let measuredHeight = 0;

      for (let index = 0; index < items.length; index += columns) {
        const rowItems = items.slice(index, index + columns);
        measuredHeight += Math.max(...rowItems.map((item) => item.getBoundingClientRect().height));
        if (index + columns < items.length) measuredHeight += rowGap;
      }

      const verticalChrome = [
        styles.paddingTop,
        styles.paddingBottom,
        styles.borderTopWidth,
        styles.borderBottomWidth,
      ].reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      const nextHeight = Math.ceil(measuredHeight + verticalChrome + 1);
      setMaxHeight((current) => current === nextHeight ? current : nextHeight);
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(grid);
    itemRefs.current.slice(0, STUDENT_EXAM_VISIBLE_LIMIT).forEach((item) => {
      if (item) observer?.observe(item);
    });
    window.addEventListener("resize", measure);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [examKey, scrollable]);

  return { gridRef, maxHeight, setItemRef };
}

interface ExamGroupFrameProps extends ExamInteractionProps {
  groupId: string;
  title: string;
  description?: string | null;
  exams: StudentExamSummary[];
  emptyMessage: string;
}

function ExamGroupFrame({
  groupId,
  title,
  description,
  exams,
  emptyMessage,
  openingExamId,
  onExamAction,
  onRetryExam,
}: ExamGroupFrameProps) {
  const sortNow = Date.now();
  const orderedExams = studentExamFrameItems(exams).sort((left, right) => (
    compareStudentExams(left, right, sortNow)
  ));
  const scrollable = shouldScrollStudentExamFrame(orderedExams.length);
  const { gridRef, maxHeight, setItemRef } = useMeasuredExamFrameHeight(
    orderedExams.map((exam) => exam.id),
    scrollable,
  );
  const headingId = `student-exam-group-${groupId}`;
  const scrollHintId = `${headingId}-scroll-hint`;

  return (
    <section aria-labelledby={headingId} className="space-y-3" data-testid={`student-exam-group-${groupId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 id={headingId} className="font-semibold">{title}</h4>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <Badge variant="secondary">{orderedExams.length} {orderedExams.length === 1 ? "exam" : "exams"}</Badge>
      </div>

      {orderedExams.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <BookOpen className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <p>{emptyMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {scrollable && (
            <p id={scrollHintId} className="text-xs text-muted-foreground">
              Showing four at a time. Scroll this group to view {orderedExams.length - STUDENT_EXAM_VISIBLE_LIMIT} more.
            </p>
          )}
          <div
            ref={gridRef}
            role={scrollable ? "region" : undefined}
            aria-labelledby={scrollable ? headingId : undefined}
            aria-describedby={scrollable ? scrollHintId : undefined}
            tabIndex={scrollable ? 0 : undefined}
            style={scrollable && maxHeight != null ? { maxHeight } : undefined}
            className={`grid gap-4 rounded-xl border bg-muted/20 p-3 lg:grid-cols-2 ${scrollable
              ? "overflow-y-auto overscroll-contain pr-2 [scrollbar-color:hsl(var(--border))_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent"
              : ""}`}
          >
            {orderedExams.map((exam, index) => (
              <div
                key={exam.id}
                ref={index < STUDENT_EXAM_VISIBLE_LIMIT ? (element) => setItemRef(index, element) : undefined}
                className="min-w-0"
              >
                <StudentExamCard
                  exam={exam}
                  openingExamId={openingExamId}
                  onExamAction={onExamAction}
                  onRetryExam={onRetryExam}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ClassExamSection({
  studentClass,
  openingExamId,
  onExamAction,
  onRetryExam,
}: { studentClass: StudentClassSummary } & ExamInteractionProps) {
  const classExamsQuery = useQuery<StudentClassExamsData>({
    queryKey: ["/api/student/classes", studentClass.id, "exams"],
    queryFn: () => requestData<StudentClassExamsData>(
      `/api/student/classes/${encodeURIComponent(studentClass.id)}/exams`,
    ),
  });
  const headingId = `student-exam-group-class-${studentClass.id}`;
  const classDetails = [
    studentClass.courseNumber,
    studentClass.sectionNumber ? `Section ${studentClass.sectionNumber}` : null,
    studentClass.professorName ? `Professor ${studentClass.professorName}` : null,
  ].filter((item): item is string => Boolean(item)).join(" · ");

  if (classExamsQuery.isLoading) {
    return (
      <section aria-labelledby={headingId} className="space-y-3">
        <div>
          <h4 id={headingId} className="font-semibold">{studentClass.name}</h4>
          {classDetails && <p className="text-sm text-muted-foreground">{classDetails}</p>}
        </div>
        <div className="grid gap-4 lg:grid-cols-2" aria-label={`Loading exams for ${studentClass.name}`}>
          {[0, 1].map((item) => (
            <Card key={item}>
              <CardHeader><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-full" /></CardHeader>
              <CardContent className="space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-10 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (classExamsQuery.isError) {
    return (
      <section aria-labelledby={headingId} className="space-y-3">
        <div>
          <h4 id={headingId} className="font-semibold">{studentClass.name}</h4>
          {classDetails && <p className="text-sm text-muted-foreground">{classDetails}</p>}
        </div>
        <Card className="border-destructive/30" role="alert">
          <CardContent className="flex flex-col items-start justify-between gap-3 py-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
              <p>{classExamsQuery.error instanceof Error ? classExamsQuery.error.message : "We could not load this class's exams."}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => classExamsQuery.refetch()} disabled={classExamsQuery.isFetching}>
              <RotateCw className={`mr-2 h-4 w-4 ${classExamsQuery.isFetching ? "animate-spin" : ""}`} /> Retry
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <ExamGroupFrame
      groupId={`class-${studentClass.id}`}
      title={studentClass.name}
      description={classDetails}
      exams={classExamsQuery.data?.exams || []}
      emptyMessage="No exams have been assigned to this class yet."
      openingExamId={openingExamId}
      onExamAction={onExamAction}
      onRetryExam={onRetryExam}
    />
  );
}

function ClassMembershipPill({
  studentClass,
  isLeaving,
  leaveDisabled,
  leaveSucceeded,
  leaveError,
  onLeave,
  onReset,
}: {
  studentClass: StudentClassSummary;
  isLeaving: boolean;
  leaveDisabled: boolean;
  leaveSucceeded: boolean;
  leaveError: string | null;
  onLeave: (classId: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const leaveLabel = studentClassLeaveLabel(studentClass.name);

  useEffect(() => {
    if (leaveSucceeded) setOpen(false);
  }, [leaveSucceeded]);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isLeaving && !nextOpen) return;
        setOpen(nextOpen);
        if (!nextOpen) onReset();
      }}
    >
      <div className="group inline-flex max-w-full items-center gap-2 rounded-full border bg-card py-1 pl-3 pr-1 text-sm">
        <School className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate font-medium">{studentClass.name}</span>
        {studentClass.professorName && <span className="hidden text-muted-foreground sm:inline">· {studentClass.professorName}</span>}
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0 rounded-full text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
            aria-label={leaveLabel}
            title={leaveLabel}
            disabled={leaveDisabled}
            data-testid={`button-leave-class-${studentClass.id}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </AlertDialogTrigger>
      </div>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this class?</AlertDialogTitle>
          <AlertDialogDescription>
            You will no longer see the active or upcoming exams assigned through this class. Your previous submissions and published results will not be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {leaveError && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {leaveError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isLeaving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              if (!isLeaving) onLeave(studentClass.id);
            }}
            data-testid={`button-confirm-leave-class-${studentClass.id}`}
          >
            {isLeaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isLeaving ? "Leaving..." : "Leave Class"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function StudentDashboard() {
  const { user, logoutUrl } = useAuth();
  const { toast } = useToast();
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [joinClassOpen, setJoinClassOpen] = useState(false);
  const [joinExamOpen, setJoinExamOpen] = useState(false);
  const [classCode, setClassCode] = useState("");
  const [examCode, setExamCode] = useState("");
  const [classJoinResult, setClassJoinResult] = useState<JoinClassData | null>(null);
  const [normalExamAccess, setNormalExamAccess] = useState<StudentExamAccessData | null>(null);
  const [adaptiveExamAccess, setAdaptiveExamAccess] = useState<StudentExamAccessData | null>(null);
  const [selectedHistory, setSelectedHistory] = useState<StudentExamHistoryItem | null>(null);

  const dashboardQuery = useQuery<StudentDashboardData>({
    queryKey: ["/api/student/dashboard"],
    queryFn: () => requestData<StudentDashboardData>("/api/student/dashboard"),
  });

  const dashboard = dashboardQuery.data;
  const displayName = dashboard?.student.displayName
    || (user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email)
    || "Student";

  const launchExam = (access: StudentExamAccessData) => {
    setJoinExamOpen(false);
    setExamCode("");
    if (access.exam.mode === "adaptive") {
      setNormalExamAccess(null);
      setAdaptiveExamAccess(access);
    } else {
      setAdaptiveExamAccess(null);
      setNormalExamAccess(access);
    }
  };

  const joinClassMutation = useMutation({
    mutationFn: (code: string) => requestData<JoinClassData>("/api/student/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classCode: code }),
    }),
    onSuccess: async (result) => {
      setClassJoinResult(result);
      setClassCode("");
      await queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
    },
  });

  const leaveClassMutation = useMutation<LeaveClassData, Error, string>({
    mutationFn: (classId: string) => requestData<LeaveClassData>(
      `/api/student/classes/${encodeURIComponent(classId)}/membership`,
      { method: "DELETE" },
    ),
    onSuccess: async (result, classId) => {
      queryClient.setQueryData<StudentDashboardData>(["/api/student/dashboard"], (current) => (
        current
          ? { ...current, classes: current.classes.filter((studentClass) => studentClass.id !== classId) }
          : current
      ));
      window.requestAnimationFrame(() => {
        document.getElementById("joined-classes-heading")?.focus();
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
      await queryClient.invalidateQueries({
        queryKey: ["/api/student/classes", classId, "exams"],
        refetchType: "none",
      });
      toast({
        title: "Class left",
        description: result.message || "You have left this class.",
      });
    },
  });

  const joinExamMutation = useMutation({
    mutationFn: async (code: string) => {
      const joined = await requestData<JoinExamData>("/api/student/exams/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examCode: code }),
      });
      return requestData<StudentExamAccessData>(`/api/student/exams/${encodeURIComponent(joined.exam.id)}`);
    },
    onSuccess: launchExam,
  });

  const openExamMutation = useMutation({
    mutationFn: (examId: string) => requestData<StudentExamAccessData>(`/api/student/exams/${encodeURIComponent(examId)}`),
    onSuccess: launchExam,
    onError: (error: Error) => {
      toast({
        title: "Exam unavailable",
        description: error.message,
        variant: "destructive",
      });
      dashboardQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/student/classes"] });
    },
  });

  const closeClassDialog = (open: boolean) => {
    setJoinClassOpen(open);
    if (!open) {
      setClassCode("");
      setClassJoinResult(null);
      joinClassMutation.reset();
    }
  };

  const closeExamDialog = (open: boolean) => {
    setJoinExamOpen(open);
    if (!open) {
      setExamCode("");
      joinExamMutation.reset();
    }
  };

  const handleExamAction = (exam: StudentExamSummary) => {
    if (exam.action === "view_result") {
      const historyItem = dashboard?.history.find((item) => item.examId === exam.id && item.resultStatus === "published");
      if (historyItem) setSelectedHistory(historyItem);
      return;
    }
    if (exam.action === "start" || exam.action === "continue") {
      openExamMutation.mutate(exam.id);
    }
  };

  const classJoinError = joinClassMutation.error instanceof Error ? joinClassMutation.error.message : null;
  const examJoinError = joinExamMutation.error instanceof Error ? joinExamMutation.error.message : null;
  const openingExamId = openExamMutation.isPending ? openExamMutation.variables : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <div className="min-w-0">
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams</h1>
              <p className="text-xs text-muted-foreground">Student Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <div className="mr-1 hidden min-w-0 text-right sm:block">
              <p className="max-w-44 truncate text-sm font-medium">{displayName}</p>
              {dashboard?.student.email && <p className="max-w-44 truncate text-xs text-muted-foreground">{dashboard.student.email}</p>}
            </div>
            <HelpSupportPopover role="student" />
            <ThemeToggle />
            <a href={logoutUrl} aria-label="Sign out">
              <Button variant="ghost" size="icon" data-testid="button-logout" title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-8 px-4 py-6 sm:py-8">
        <section className="space-y-2">
          <p className="text-sm font-medium text-primary">Welcome back</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
            Join a class, access an exam, or continue where you left off.
          </p>
        </section>

        <section aria-labelledby="student-actions-heading" className="space-y-4">
          <div>
            <h3 id="student-actions-heading" className="text-lg font-semibold">Get started</h3>
            <p className="text-sm text-muted-foreground">Codes provide access after your account has been authenticated.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-primary/25 shadow-sm">
              <CardContent className="flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold">Join a class</h4>
                    <p className="text-sm text-muted-foreground">Enroll once to see all exams shared with that class on every sign-in.</p>
                  </div>
                </div>
                <Button onClick={() => setJoinClassOpen(true)} className="w-full justify-between" data-testid="button-join-class-with-code">
                  Join Class with Code <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            <Card className="border-primary/25 shadow-sm">
              <CardContent className="flex h-full flex-col justify-between gap-5 p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-semibold">Access a specific exam</h4>
                    <p className="text-sm text-muted-foreground">Use an exam code when your professor has enabled direct authenticated access.</p>
                  </div>
                </div>
                <Button onClick={() => setJoinExamOpen(true)} className="w-full justify-between" data-testid="button-join-exam-with-code">
                  Join Exam with Code <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Card className="border-primary/20 bg-primary/[0.04]" data-testid="card-voxpractice-entry">
          <CardContent className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Mic className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">VoxPractice</h3>
                  <span className="inline-flex items-center gap-1 text-xs text-primary"><Lock className="h-3 w-3" /> Private</span>
                </div>
                <p className="text-sm text-muted-foreground">Practice oral answers privately and receive a readiness estimate. Nothing is sent to your professor.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => setPracticeOpen(true)} data-testid="button-open-voxpractice" className="w-full flex-shrink-0 sm:w-auto">
              <Mic className="mr-2 h-4 w-4" /> Start practicing
            </Button>
          </CardContent>
        </Card>

        {dashboardQuery.isLoading ? (
          <DashboardSkeleton />
        ) : dashboardQuery.isError ? (
          <Card className="border-destructive/30" role="alert">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <AlertCircle className="h-9 w-9 text-destructive" />
              <div>
                <h3 className="font-semibold">We could not load your dashboard</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {dashboardQuery.error instanceof Error ? dashboardQuery.error.message : "Please try again."}
                </p>
              </div>
              <Button variant="outline" onClick={() => dashboardQuery.refetch()} disabled={dashboardQuery.isFetching}>
                <RotateCw className={`mr-2 h-4 w-4 ${dashboardQuery.isFetching ? "animate-spin" : ""}`} /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : dashboard ? (
          <>
            <section aria-labelledby="joined-classes-heading" className="space-y-3">
              <h3 id="joined-classes-heading" tabIndex={-1} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">My classes</h3>
              {dashboard.classes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {dashboard.classes.map((studentClass) => {
                    const leaveMatchesClass = leaveClassMutation.variables === studentClass.id;
                    return (
                      <ClassMembershipPill
                        key={studentClass.id}
                        studentClass={studentClass}
                        isLeaving={leaveMatchesClass && leaveClassMutation.isPending}
                        leaveDisabled={leaveClassMutation.isPending}
                        leaveSucceeded={leaveMatchesClass && leaveClassMutation.isSuccess}
                        leaveError={leaveMatchesClass && leaveClassMutation.error instanceof Error ? leaveClassMutation.error.message : null}
                        onLeave={(classId) => leaveClassMutation.mutate(classId)}
                        onReset={() => {
                          if (!leaveClassMutation.isPending) leaveClassMutation.reset();
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <Card data-testid="empty-student-classes">
                  <CardContent className="flex flex-col items-start justify-between gap-4 py-6 sm:flex-row sm:items-center">
                    <div className="flex items-start gap-3">
                      <School className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <h4 className="font-semibold">You have not joined a class yet</h4>
                        <p className="mt-1 text-sm text-muted-foreground">Use the Class Code from your professor to see assigned exams here.</p>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full flex-shrink-0 sm:w-auto" onClick={() => setJoinClassOpen(true)}>
                      Join Class with Code
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>

            <section aria-labelledby="my-exams-heading" className="space-y-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h3 id="my-exams-heading" className="text-xl font-semibold">My Exams</h3>
                  <p className="text-sm text-muted-foreground">Available, upcoming, and submitted assessments.</p>
                </div>
              </div>

              {dashboard.classes.length === 0 && dashboard.exams.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                    <BookOpen className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <h4 className="font-semibold">No exams yet</h4>
                      <p className="mt-1 max-w-md text-sm text-muted-foreground">Join a class or enter an exam code when your professor shares one.</p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-8">
                  {dashboard.classes.map((studentClass) => (
                    <ClassExamSection
                      key={studentClass.id}
                      studentClass={studentClass}
                      openingExamId={openingExamId}
                      onExamAction={handleExamAction}
                      onRetryExam={(examId) => openExamMutation.mutate(examId)}
                    />
                  ))}
                  {dashboard.exams.length > 0 && (
                    <ExamGroupFrame
                      groupId="direct-access"
                      title="Direct Exam Access"
                      description="Exams opened with an Exam Code, assigned directly to you, or currently in progress."
                      exams={dashboard.exams}
                      emptyMessage="No direct or individually assigned exams are available."
                      openingExamId={openingExamId}
                      onExamAction={handleExamAction}
                      onRetryExam={(examId) => openExamMutation.mutate(examId)}
                    />
                  )}
                </div>
              )}
            </section>

            <section aria-labelledby="history-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 id="history-heading" className="flex items-center gap-2 text-xl font-semibold"><History className="h-5 w-5 text-primary" /> Results &amp; Exam History</h3>
                  <p className="text-sm text-muted-foreground">Official scores appear only after professor review and publication.</p>
                </div>
                <Badge variant="secondary">{dashboard.history.length} completed</Badge>
              </div>

              {dashboard.history.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center">
                    <History className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                    <h4 className="font-semibold">No exam history</h4>
                    <p className="mt-1 text-sm text-muted-foreground">Submitted exams and published results will appear here.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-hidden rounded-lg border bg-card">
                  {dashboard.history.map((item, index) => (
                    <div key={item.attemptId} className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between ${index > 0 ? "border-t" : ""}`}>
                      <div className="min-w-0 space-y-1">
                        <p className="truncate font-medium">{item.examTitle}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {item.className && <span>{item.className}</span>}
                          {item.professorName && <span>{item.professorName}</span>}
                          <span>Completed {displayDate(item.completedAt)}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                        {item.resultStatus === "published" ? (
                          <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> {item.officialScoreLabel || "Published"}</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Pending Review</Badge>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setSelectedHistory(item)} data-testid={`button-history-details-${item.attemptId}`}>
                          View Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>

      <Dialog open={joinClassOpen} onOpenChange={closeClassDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Join Class with Code</DialogTitle>
            <DialogDescription>Your membership will remain linked to this account after future sign-ins.</DialogDescription>
          </DialogHeader>
          {classJoinResult ? (
            <div className="space-y-4 py-2" aria-live="polite">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">{classJoinResult.alreadyJoined ? "You are already a member" : "Class joined successfully"}</p>
                    <p className="mt-1 text-sm">{classJoinResult.class.name}</p>
                    {classJoinResult.class.professorName && <p className="text-sm opacity-80">Professor: {classJoinResult.class.professorName}</p>}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => closeClassDialog(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <form
              className="space-y-4 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                const code = classCode.trim();
                if (code) joinClassMutation.mutate(code);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="student-class-code">Class Code</Label>
                <Input
                  id="student-class-code"
                  value={classCode}
                  onChange={(event) => { setClassCode(event.target.value.toUpperCase()); joinClassMutation.reset(); }}
                  placeholder="Enter class code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  disabled={joinClassMutation.isPending}
                  aria-describedby={classJoinError ? "class-code-error" : undefined}
                  autoFocus
                  data-testid="input-student-class-code"
                />
              </div>
              {classJoinError && <p id="class-code-error" className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {classJoinError}</p>}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeClassDialog(false)} disabled={joinClassMutation.isPending}>Cancel</Button>
                <Button type="submit" disabled={!classCode.trim() || joinClassMutation.isPending} data-testid="button-submit-class-code">
                  {joinClassMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {joinClassMutation.isPending ? "Joining..." : "Join Class"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={joinExamOpen} onOpenChange={closeExamDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Join Exam with Code</DialogTitle>
            <DialogDescription>The server will verify the exam period, access policy, and your remaining attempts.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              const code = examCode.trim();
              if (code) joinExamMutation.mutate(code);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="student-exam-code">Exam Code</Label>
              <Input
                id="student-exam-code"
                value={examCode}
                onChange={(event) => { setExamCode(event.target.value.toUpperCase()); joinExamMutation.reset(); }}
                placeholder="Enter exam code"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={joinExamMutation.isPending}
                aria-describedby={examJoinError ? "exam-code-error" : undefined}
                autoFocus
                data-testid="input-student-exam-code"
              />
            </div>
            {examJoinError && <p id="exam-code-error" className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" /> {examJoinError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => closeExamDialog(false)} disabled={joinExamMutation.isPending}>Cancel</Button>
              <Button type="submit" disabled={!examCode.trim() || joinExamMutation.isPending} data-testid="button-submit-exam-code">
                {joinExamMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {joinExamMutation.isPending ? "Checking..." : "Open Exam"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedHistory !== null} onOpenChange={(open) => !open && setSelectedHistory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exam details</DialogTitle>
            <DialogDescription>{selectedHistory?.examTitle}</DialogDescription>
          </DialogHeader>
          {selectedHistory && (
            <div className="space-y-4 py-2">
              <div className="grid gap-3 rounded-lg border p-4 text-sm">
                {selectedHistory.className && <div><p className="text-xs text-muted-foreground">Class</p><p className="font-medium">{selectedHistory.className}</p></div>}
                {selectedHistory.professorName && <div><p className="text-xs text-muted-foreground">Professor</p><p className="font-medium">{selectedHistory.professorName}</p></div>}
                <div><p className="text-xs text-muted-foreground">Completed</p><p className="font-medium">{displayDate(selectedHistory.completedAt)}</p></div>
                <div>
                  <p className="text-xs text-muted-foreground">Result</p>
                  {selectedHistory.resultStatus === "published" ? (
                    <p className="text-2xl font-bold text-primary">{selectedHistory.officialScoreLabel || "Published"}</p>
                  ) : (
                    <p className="font-medium text-amber-700 dark:text-amber-300">Pending professor review</p>
                  )}
                </div>
              </div>
              {selectedHistory.resultStatus === "pending_review" && (
                <p className="text-sm text-muted-foreground">Your submission is safely recorded. No AI-suggested score is shown as an official result.</p>
              )}
            </div>
          )}
          <DialogFooter><Button onClick={() => setSelectedHistory(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {normalExamAccess && (
        <TakeExamDialog
          exam={normalExamAccess.exam}
          attemptId={normalExamAccess.attemptId || undefined}
          open
          onOpenChange={(open) => {
            if (!open) {
              setNormalExamAccess(null);
              queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["/api/student/classes"] });
            }
          }}
        />
      )}

      {adaptiveExamAccess && (
        <AdaptiveExamDialog
          open
          examId={adaptiveExamAccess.exam.id}
          attemptId={adaptiveExamAccess.attemptId || undefined}
          onOpenChange={(open) => {
            if (!open) {
              setAdaptiveExamAccess(null);
              queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
              queryClient.invalidateQueries({ queryKey: ["/api/student/classes"] });
            }
          }}
        />
      )}

      <VoxPracticeDialog open={practiceOpen} onOpenChange={setPracticeOpen} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading dashboard">
      <section className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((item) => (
            <Card key={item}>
              <CardHeader><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /></CardHeader>
              <CardContent className="space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-10 w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <Skeleton className="h-7 w-56" />
        <Card><CardContent className="space-y-3 py-6"><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-3/4" /></CardContent></Card>
      </section>
    </div>
  );
}
