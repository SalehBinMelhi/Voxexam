import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { TakeExamDialog } from "@/components/take-exam-dialog";
import { HelpSupportPopover } from "@/components/help-support-popover";
import { 
  LogOut, 
  Calendar, 
  Clock,
  BookOpen,
  FileQuestion,
  Play,
  CheckCircle2,
  AlertCircle,
  Trophy,
  GraduationCap,
} from "lucide-react";
import type { Exam, ExamSubmission } from "@shared/schema";
import { format, parseISO, isAfter, isBefore } from "date-fns";

function getExamStatus(exam: Exam): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; canTake: boolean } {
  if (!exam.startTime || !exam.endTime) {
    return { label: "Available", variant: "default", canTake: true };
  }
  const now = new Date();
  const start = parseISO(exam.startTime);
  const end = parseISO(exam.endTime);
  
  if (isBefore(now, start)) {
    return { label: "Upcoming", variant: "outline", canTake: false };
  }
  if (isAfter(now, end)) {
    return { label: "Ended", variant: "secondary", canTake: false };
  }
  return { label: "Active", variant: "destructive", canTake: true };
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  const { data: exams = [], isLoading: examsLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const { data: submissions = [] } = useQuery<ExamSubmission[]>({
    queryKey: ["/api/submissions"],
  });

  const submittedExamIds = new Set(submissions.map((s) => s.examId));

  const activeExams = exams.filter((e) => getExamStatus(e).canTake && !submittedExamIds.has(e.id));
  const completedExams = exams.filter((e) => submittedExamIds.has(e.id));
  const upcomingExams = exams.filter((e) => getExamStatus(e).label === "Upcoming");

  const averageScore = submissions.length > 0
    ? submissions.reduce((sum, s) => sum + s.totalScore, 0) / submissions.length
    : 0;

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user?.email || "Student";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <div>
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-logo-fg))" }}>Vox</span>Exams</h1>
              <p className="text-xs text-muted-foreground">Student Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {user?.profileImageUrl && (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {displayName}
            </span>
            <HelpSupportPopover role="student" />
            <ThemeToggle />
            <a href="/api/logout">
              <Button variant="ghost" size="icon" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div>
          <h2 className="text-2xl font-bold">My Exams</h2>
          <p className="text-muted-foreground">View and take your assigned exams</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeExams.length}</p>
                <p className="text-xs text-muted-foreground">Active Exams</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">{upcomingExams.length}</p>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedExams.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(averageScore * 100).toFixed(0)}%</p>
                <p className="text-xs text-muted-foreground">Avg Score</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {activeExams.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Active Exams - Ready to Take
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeExams.map((exam) => (
                <Card key={exam.id} className="border-destructive/30 bg-destructive/5" data-testid={`card-active-exam-${exam.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                      <Badge variant="destructive">Active</Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1">
                      <FileQuestion className="h-3.5 w-3.5" />
                      {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {exam.endTime && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Ends {format(parseISO(exam.endTime), "MMM d, h:mm a")}</span>
                      </div>
                    )}
                    <Button 
                      className="w-full" 
                      onClick={() => setSelectedExam(exam)}
                      data-testid={`button-take-exam-${exam.id}`}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Start Exam
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {upcomingExams.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-chart-3" />
              Upcoming Exams
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingExams.map((exam) => (
                <Card key={exam.id} data-testid={`card-upcoming-exam-${exam.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                      <Badge variant="outline">Upcoming</Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1">
                      <FileQuestion className="h-3.5 w-3.5" />
                      {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {exam.startTime && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Starts {format(parseISO(exam.startTime), "MMM d, yyyy h:mm a")}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {completedExams.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-chart-2" />
              Completed Exams
            </h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedExams.map((exam) => {
                const submission = submissions.find((s) => s.examId === exam.id);
                return (
                  <Card key={exam.id} data-testid={`card-completed-exam-${exam.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                        <div className="flex flex-col gap-1">
                          {submission && (
                            <>
                              <Badge
                                variant={submission.totalScore >= 0.7 ? "default" : submission.totalScore >= 0.5 ? "secondary" : "destructive"}
                                data-testid={`badge-correctness-${exam.id}`}
                              >
                                Correctness: {(submission.totalScore * 100).toFixed(0)}%
                              </Badge>
                              {submission.totalUnderstandingScore != null && (
                                <Badge
                                  variant={submission.totalUnderstandingScore >= 0.7 ? "default" : submission.totalUnderstandingScore >= 0.5 ? "secondary" : "destructive"}
                                  data-testid={`badge-understanding-${exam.id}`}
                                >
                                  Understanding: {(submission.totalUnderstandingScore * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <FileQuestion className="h-3.5 w-3.5" />
                        {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {submission && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Submitted {format(parseISO(submission.submittedAt), "MMM d, yyyy h:mm a")}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {examsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : exams.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                <BookOpen className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No exams assigned</h3>
              <p className="text-muted-foreground text-sm">
                You don't have any exams assigned yet. Check back later!
              </p>
            </CardContent>
          </Card>
        ) : null}
      </main>
      {selectedExam && (
        <TakeExamDialog
          exam={selectedExam}
          open={!!selectedExam}
          onOpenChange={(open) => !open && setSelectedExam(null)}
        />
      )}
    </div>
  );
}
