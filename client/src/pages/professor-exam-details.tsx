import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, CheckCircle, Clock, Settings, FileQuestion, History, Mic } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DoctorAttemptReviewer } from "@/components/doctor-attempt-reviewer";
import { queryClient } from "@/lib/queryClient";
import type { Exam, ExamSubmission } from "@shared/schema";

export default function ProfessorExamDetails() {
  const { examId } = useParams<{ examId: string }>();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedAdaptiveAttemptId, setSelectedAdaptiveAttemptId] = useState<string | null>(null);

  const { data: exam, isLoading: examLoading } = useQuery<Exam>({
    queryKey: [`/api/exams/${examId}`],
  });

  const { data: attempts = [], isLoading: attemptsLoading } = useQuery<ExamSubmission[]>({
    queryKey: [`/api/exams/${examId}/attempts`],
    enabled: !!examId,
  });

  if (examLoading || attemptsLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="border-b bg-card sticky top-0 z-50">
          <div className="container mx-auto px-4 py-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="h-6 w-48 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!exam) {
    return <div className="p-8 text-center text-red-500">Exam not found or you don't have access.</div>;
  }

  const isAdaptiveExam = exam.mode === "adaptive";
  const isAttemptCompleted = (attempt: ExamSubmission) =>
    attempt.status === "completed" || !!attempt.submittedAt;
  const getAttemptScore = (attempt: ExamSubmission): number | null => {
    if (isAdaptiveExam) {
      const score = attempt.doctorFinalScore ?? attempt.finalScore ?? attempt.percentageScore ?? attempt.totalScore;
      return typeof score === "number" ? score : null;
    }

    if (typeof attempt.percentageScore === "number") return attempt.percentageScore;
    return typeof attempt.totalScore === "number" ? attempt.totalScore * 100 : null;
  };
  const reviewAttempt = (attemptId: string) => {
    if (isAdaptiveExam) {
      setSelectedAdaptiveAttemptId(attemptId);
      return;
    }
    setLocation(`/professor/exams/${exam.id}/attempts/${attemptId}`);
  };
  const completedAttempts = attempts.filter(isAttemptCompleted);
  const completedScores = completedAttempts
    .map(getAttemptScore)
    .filter((score): score is number => score !== null);
  const averageScore = completedScores.length > 0
    ? completedScores.reduce((sum, score) => sum + score, 0) / completedScores.length
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-lg">{exam.title}</h1>
                <Badge variant={exam.status === "active" ? "default" : "secondary"}>
                  {exam.status === "active" ? "Published" : "Draft"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                {exam.mode === "adaptive" ? <><Mic className="h-3 w-3"/> Adaptive Oral Exam</> : "Standard Exam"}
                {exam.publicExamCode && <span>· Code: <span className="font-mono text-primary font-bold">{exam.publicExamCode}</span></span>}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 h-auto">
            <TabsTrigger value="overview" className="flex items-center gap-2 py-3 text-sm">
              <CheckCircle className="h-4 w-4" /> <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="questions" className="flex items-center gap-2 py-3 text-sm">
              <FileQuestion className="h-4 w-4" /> <span className="hidden sm:inline">Questions</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 py-3 text-sm">
              <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
            <TabsTrigger value="submissions" className="flex items-center gap-2 py-3 text-sm relative">
              <Users className="h-4 w-4" /> <span className="hidden sm:inline">Submissions</span>
              {attempts.length > 0 && (
                <Badge variant="secondary" className="absolute -top-2 -right-2 text-[10px] px-1.5 min-w-5 h-5 flex items-center justify-center rounded-full">
                  {attempts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 py-3 text-sm">
              <History className="h-4 w-4" /> <span className="hidden sm:inline">Version History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Total Attempts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{attempts.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">{completedAttempts.length} completed</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Average Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{completedScores.length > 0 ? Math.round(averageScore) + "%" : "N/A"}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    Duration Limit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{exam.durationMinutes}</div>
                  <p className="text-xs text-muted-foreground mt-1">minutes</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-purple-500" />
                    Max Questions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{exam.maxQuestions}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Submissions</CardTitle>
                <CardDescription>The latest attempts from your students.</CardDescription>
              </CardHeader>
              <CardContent>
                {attempts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                    <Users className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    <p>No students have taken this exam yet.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student ID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Review</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attempts.slice(0, 5).map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell className="font-medium">{attempt.studentId}</TableCell>
                          <TableCell>
                            <Badge variant={isAttemptCompleted(attempt) ? "outline" : "secondary"}>
                              {isAttemptCompleted(attempt) ? "Completed" : "In Progress"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getAttemptScore(attempt) !== null ? `${Math.round(getAttemptScore(attempt) as number)}%` : "-"}
                          </TableCell>
                          <TableCell>
                             {attempt.reviewStatus === "manually_adjusted" ? (
                               <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200">
                                 Overridden
                               </Badge>
                             ) : (
                               <span className="text-xs text-muted-foreground">Auto-scored</span>
                             )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => reviewAttempt(attempt.id)}
                            >
                              Review
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {attempts.length > 5 && (
                  <div className="mt-4 flex justify-center">
                    <Button variant="ghost" onClick={() => setActiveTab("submissions")}>
                      View All {attempts.length} Submissions
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="questions">
            <Card>
              <CardHeader>
                <CardTitle>Exam Questions</CardTitle>
                <CardDescription>
                  The current active version of questions for this exam.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {exam.questions?.length > 0 ? (
                  exam.questions.map((q: any, idx: number) => (
                    <div key={q.id || idx} className="p-4 border rounded-lg bg-card">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline">Q{idx + 1}</Badge>
                            <Badge className="capitalize">{q.type}</Badge>
                            {q.maximumPoints && <span className="text-xs text-muted-foreground">{q.maximumPoints} pts</span>}
                          </div>
                          <p className="font-medium text-sm mb-2">{q.text}</p>
                          {q.correctAnswer && (
                            <div className="text-xs bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 p-2 rounded border border-emerald-100 dark:border-emerald-900">
                              <span className="font-semibold block mb-1">Expected Key Points:</span>
                              {q.correctAnswer}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No questions found.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
             <Card>
               <CardHeader>
                 <CardTitle>Exam Settings</CardTitle>
                 <CardDescription>Configuration for this exam.</CardDescription>
               </CardHeader>
               <CardContent className="space-y-6">
                 <div className="grid grid-cols-2 gap-y-4">
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">Title</p>
                     <p>{exam.title}</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">Subject</p>
                     <p>{exam.subjectName || "N/A"}</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">Duration</p>
                     <p>{exam.durationMinutes} Minutes</p>
                   </div>
                   <div>
                     <p className="text-sm font-medium text-muted-foreground">Passing Score</p>
                     <p>{exam.passingScore}%</p>
                   </div>
                   <div className="col-span-2">
                     <p className="text-sm font-medium text-muted-foreground">Description</p>
                     <p className="whitespace-pre-wrap text-sm">{exam.description || "No description provided."}</p>
                   </div>
                 </div>
               </CardContent>
             </Card>
          </TabsContent>

          <TabsContent value="submissions">
            <Card>
              <CardHeader>
                <CardTitle>All Student Submissions</CardTitle>
                <CardDescription>Review and manually grade student attempts.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Review Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attempts.map((attempt) => (
                      <TableRow key={attempt.id}>
                        <TableCell className="font-medium">{attempt.studentId}</TableCell>
                        <TableCell>
                           <Badge variant={attempt.submittedAt ? "outline" : "secondary"}>
                             {attempt.submittedAt ? "Completed" : "In Progress"}
                           </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {attempt.percentageScore !== null ? `${Math.round(attempt.percentageScore)}%` : 
                             attempt.totalScore ? `${Math.round(attempt.totalScore * 100)}%` : "-"}
                        </TableCell>
                        <TableCell>
                           {attempt.reviewStatus === "manually_adjusted" ? (
                             <Badge className="bg-amber-100 text-amber-800 border-amber-200">Overridden</Badge>
                           ) : (
                             <span className="text-xs text-muted-foreground">Auto-scored</span>
                           )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => reviewAttempt(attempt.id)}
                          >
                            Review
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {attempts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No submissions available.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Version History</CardTitle>
                <CardDescription>History of modifications made to this exam.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                   <div className="p-4 border rounded-lg bg-muted/20">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <Badge>Current</Badge>
                         <span className="font-medium">Version Details</span>
                       </div>
                       <span className="text-xs text-muted-foreground">
                         {exam.currentVersionId ? "Active Draft/Published" : "Legacy Version"}
                       </span>
                     </div>
                     <p className="text-sm mt-2 text-muted-foreground">
                       This page currently shows the configuration of the latest active version. Full historical view will be unlocked in the next update.
                     </p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <DoctorAttemptReviewer
        open={selectedAdaptiveAttemptId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedAdaptiveAttemptId(null);
        }}
        attemptId={selectedAdaptiveAttemptId}
        onOverrideSaved={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/exams/${examId}/attempts`] });
        }}
      />
    </div>
  );
}
