import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, User, Clock, Volume2, Edit, Save, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Exam, ExamSubmission } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function ProfessorAttemptDetails() {
  const { examId, attemptId } = useParams<{ examId: string; attemptId: string }>();
  const [_, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [questionIdToOverride, setQuestionIdToOverride] = useState<string>("");
  const [newScore, setNewScore] = useState<number | "">("");
  const [overrideReason, setOverrideReason] = useState("");

  const { data: exam, isLoading: examLoading } = useQuery<Exam>({
    queryKey: [`/api/exams/${examId}`],
  });

  const { data: attempt, isLoading: attemptLoading } = useQuery<ExamSubmission & { attemptAnswers?: any[] }>({
    queryKey: [`/api/submissions/${attemptId}`],
  });

  const overrideMutation = useMutation({
    mutationFn: async (data: { questionId: string; newScore: number; reason: string }) => {
      const res = await apiRequest("PUT", `/api/attempts/${attemptId}/override-score`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/submissions/${attemptId}`] });
      toast({ title: "Score overridden successfully" });
      setQuestionIdToOverride("");
      setNewScore("");
      setOverrideReason("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to override score", description: err.message, variant: "destructive" });
    },
  });

  if (examLoading || attemptLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading attempt details...</div>;
  }

  if (!exam || !attempt) {
    return <div className="p-8 text-center text-red-500">Not found or unauthorized.</div>;
  }

  const originalScore = attempt.totalScore;
  const currentDocScore = attempt.doctorFinalScore;
  const attemptAnswers = attempt.attemptAnswers || [];

  return (
    <div className="min-h-screen bg-background pb-12">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation(`/professor/exams/${examId}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-lg">Attempt Review</h1>
            <p className="text-xs text-muted-foreground">{exam.title}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <Label className="text-xs text-muted-foreground">Student Identity</Label>
              <div className="font-semibold text-lg flex items-center gap-2 mt-1">
                <User className="h-5 w-5 text-primary" /> {attempt.studentId}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <div className="font-semibold text-lg mt-1 flex items-center gap-2">
                <Badge variant={attempt.submittedAt ? "default" : "secondary"}>
                   {attempt.submittedAt ? "Completed" : "In Progress"}
                </Badge>
                {attempt.reviewStatus === "manually_adjusted" && (
                   <Badge variant="outline" className="border-amber-500 text-amber-600">Reviewed</Badge>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <Label className="text-xs text-muted-foreground">Submitted At</Label>
              <div className="font-semibold text-lg mt-1 flex items-center gap-2">
                <Clock className="h-4 w-4" /> 
                {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : "N/A"}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Overall Score Summary
              </span>
              {attempt.reviewStatus === "manually_adjusted" && (
                <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                  Professor Overridden
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border p-4 rounded-md bg-background text-center">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Original AI Score</span>
                <div className="text-4xl font-bold text-primary mt-2">{Math.round(originalScore * 100)}%</div>
              </div>
              <div className="border p-4 rounded-md bg-background text-center flex flex-col justify-center">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Final Score (Adjusted)</span>
                <div className="text-4xl font-bold text-emerald-600 mt-2">
                  {currentDocScore !== null && currentDocScore !== undefined 
                    ? Math.round(currentDocScore * 100) 
                    : attempt.percentageScore 
                       ? Math.round(attempt.percentageScore)
                       : Math.round(originalScore * 100)}%
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight mt-8 mb-4">Exam Responses</h2>
          
          {attemptAnswers.length > 0 ? (
            attemptAnswers.map((answer: any, idx: number) => {
              const question = exam.questions?.find((q: any) => q.id === answer.questionId);
              const activeScore = answer.manualScore ?? answer.automaticScore;

              return (
                <Card key={idx} className="border">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="text-xs">
                        Q{idx + 1}: {question?.type || "Question"}
                      </Badge>
                      <div className="flex gap-2 items-center">
                        {answer.automaticScore !== null && (
                          <span className="text-xs text-muted-foreground">AI: {Math.round(answer.automaticScore * 100)}%</span>
                        )}
                        {answer.manualScore !== null && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-200">
                             Manual: {Math.round(answer.manualScore * 100)}%
                          </Badge>
                        )}
                        {!answer.manualScore && answer.automaticScore !== null && (
                           <Badge variant="secondary">{Math.round(answer.automaticScore * 100)}%</Badge>
                        )}
                      </div>
                    </div>
                    <CardTitle className="text-sm font-semibold mt-1">
                      {question?.text || "Unknown Question text (Legacy)"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    {answer.audioStoragePath && answer.audioStoragePath.startsWith("data:audio") && (
                      <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-primary" />
                        <audio src={answer.audioStoragePath} controls className="w-full h-8" />
                      </div>
                    )}
                    <div>
                      <strong className="text-sm">Transcript / Answer:</strong>
                      <p className="text-muted-foreground bg-muted/40 p-3 rounded mt-1 text-sm leading-relaxed">
                        {answer.transcript || answer.answerText || "No answer text available."}
                      </p>
                    </div>

                    {answer.manualFeedback && (
                      <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 rounded text-sm">
                        <span className="font-semibold block mb-1">Override Reason:</span>
                        {answer.manualFeedback}
                      </div>
                    )}
                    
                    <div className="mt-4 p-4 border rounded-md bg-card">
                      <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                        <Edit className="h-4 w-4" /> Adjust Score for this Answer
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                        <div>
                          <Label className="text-xs">New Score (0-100)</Label>
                          <Input
                            type="number"
                            placeholder="Score"
                            value={questionIdToOverride === answer.questionId ? (newScore === "" ? "" : newScore * 100) : ""}
                            onChange={(e) => {
                              setQuestionIdToOverride(answer.questionId);
                              setNewScore(e.target.value === "" ? "" : Number(e.target.value) / 100);
                            }}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-xs">Reason for Override</Label>
                          <Input
                            placeholder="Reason for changing score..."
                            value={questionIdToOverride === answer.questionId ? overrideReason : ""}
                            onChange={(e) => {
                              setQuestionIdToOverride(answer.questionId);
                              setOverrideReason(e.target.value);
                            }}
                          />
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => overrideMutation.mutate({ questionId: answer.questionId, newScore: newScore as number, reason: overrideReason })}
                          disabled={overrideMutation.isPending || questionIdToOverride !== answer.questionId || newScore === "" || !overrideReason}
                        >
                          <Save className="h-4 w-4 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <p>No recorded answers found for this attempt.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
