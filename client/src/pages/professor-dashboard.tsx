import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateExamDialog } from "@/components/create-exam-dialog";
import { ExamDetailsDialog } from "@/components/exam-details-dialog";
import { 
  Plus, 
  LogOut, 
  Calendar, 
  Users, 
  FileQuestion, 
  Clock,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import type { Exam } from "@shared/schema";
import { format, parseISO, isAfter, isBefore } from "date-fns";

function getExamStatus(exam: Exam): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
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

export default function ProfessorDashboard() {
  const { user, logout } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);

  const { data: exams = [], isLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const myExams = exams.filter((exam) => exam.professorId === user?.id);

  const stats = {
    total: myExams.length,
    active: myExams.filter((e) => getExamStatus(e).label === "Active").length,
    scheduled: myExams.filter((e) => getExamStatus(e).label === "Scheduled").length,
    completed: myExams.filter((e) => getExamStatus(e).label === "Completed").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-md flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">Oral Exam System</h1>
              <p className="text-xs text-muted-foreground">Professor Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              Welcome, <span className="font-medium text-foreground">{user?.username}</span>
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">My Exams</h2>
            <p className="text-muted-foreground">Create and manage your oral examinations</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-exam">
            <Plus className="h-4 w-4 mr-2" />
            Create Exam
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total Exams</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active Now</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-chart-3" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.scheduled}</p>
                <p className="text-xs text-muted-foreground">Scheduled</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-full" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : myExams.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                <FileQuestion className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No exams yet</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Get started by creating your first oral examination
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-exam">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Exam
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myExams.map((exam) => {
              const status = getExamStatus(exam);
              return (
                <Card
                  key={exam.id}
                  className="cursor-pointer hover-elevate transition-all"
                  onClick={() => setSelectedExam(exam)}
                  data-testid={`card-exam-${exam.id}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg line-clamp-1">{exam.title}</CardTitle>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <CardDescription className="flex items-center gap-1">
                      <FileQuestion className="h-3.5 w-3.5" />
                      {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {exam.startTime && exam.endTime ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {format(parseISO(exam.startTime), "MMM d, yyyy h:mm a")}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Not scheduled</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>
                        {exam.assignedStudentIds.length + (exam.assignedStudentNames?.length || 0)} student{(exam.assignedStudentIds.length + (exam.assignedStudentNames?.length || 0)) !== 1 ? "s" : ""} assigned
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <CreateExamDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      {selectedExam && (
        <ExamDetailsDialog
          exam={selectedExam}
          open={!!selectedExam}
          onOpenChange={(open) => !open && setSelectedExam(null)}
        />
      )}
    </div>
  );
}
