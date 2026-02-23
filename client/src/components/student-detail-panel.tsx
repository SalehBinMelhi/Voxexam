import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  X,
  User,
  BookOpen,
  Trophy,
  AlertTriangle,
  Monitor,
  Camera,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CheckCircle2,
  Clock,
  Shield,
  Video,
} from "lucide-react";
import { ShieldAlert, Sparkles } from "lucide-react";
import type { Exam, ExamSubmission, Question } from "@shared/schema";
import { TAB_SWITCH_SUSPICIOUS_THRESHOLD } from "@shared/schema";
import { format, parseISO } from "date-fns";

type GraphMode = "both" | "correctness" | "understanding";

interface StudentDetailPanelProps {
  studentId: string;
  studentName: string;
  exams: Exam[];
  submissions: ExamSubmission[];
  onClose: () => void;
}

function getScoreColor(score: number) {
  if (score >= 0.8) return "text-green-600 dark:text-green-400";
  if (score >= 0.6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getScoreBg(score: number) {
  if (score >= 0.8) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 0.6) return "bg-yellow-100 dark:bg-yellow-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

function getGradingMethodLabel(method: string) {
  switch (method) {
    case "ai": return "AI Graded";
    case "exact": return "Exact Match";
    case "manual": return "Manual";
    case "fallback": return "Fallback";
    default: return method;
  }
}

function getGradingMethodVariant(method: string): "default" | "secondary" | "outline" | "destructive" {
  switch (method) {
    case "ai": return "default";
    case "exact": return "secondary";
    case "manual": return "outline";
    default: return "secondary";
  }
}

export function StudentDetailPanel({ studentId, studentName, exams, submissions, onClose }: StudentDetailPanelProps) {
  const { toast } = useToast();
  const [graphMode, setGraphMode] = useState<GraphMode>("both");
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [proctoringAnalysis, setProctoringAnalysis] = useState<Record<string, string>>({});

  const analyzeProctoring = useMutation({
    mutationFn: async (submissionId: string) => {
      const response = await apiRequest("POST", `/api/submissions/${submissionId}/analyze-proctoring`);
      const data = await response.json();
      return { submissionId, analysis: data.analysis as string };
    },
    onSuccess: (data) => {
      setProctoringAnalysis(prev => ({ ...prev, [data.submissionId]: data.analysis }));
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to run proctoring analysis", variant: "destructive" });
    },
  });

  const studentSubs = submissions
    .filter(s => s.studentId === studentId && s.isPreview !== "true")
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  const chartData = studentSubs.map(sub => {
    const exam = exams.find(e => e.id === sub.examId);
    return {
      examName: exam?.title || "Unknown Exam",
      correctness: Math.round(sub.totalScore * 100),
      understanding: Math.round((sub.totalUnderstandingScore || 0) * 100),
    };
  });

  const avgCorrectness = studentSubs.length > 0
    ? studentSubs.reduce((sum, s) => sum + s.totalScore, 0) / studentSubs.length
    : 0;
  const avgUnderstanding = studentSubs.length > 0
    ? studentSubs.reduce((sum, s) => sum + (s.totalUnderstandingScore || 0), 0) / studentSubs.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="button-close-student-detail">
          <X className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5" />
            {studentName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {studentSubs.length} exam{studentSubs.length !== 1 ? "s" : ""} taken
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{studentSubs.length}</p>
                <p className="text-xs text-muted-foreground">Exams Taken</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(avgCorrectness)}`}>
                  {(avgCorrectness * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Avg Correctness</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${getScoreColor(avgUnderstanding)}`}>
                  {(avgUnderstanding * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">Avg Understanding</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">Performance Over Time</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={graphMode === "both" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGraphMode("both")}
                  data-testid="button-graph-both"
                >
                  Both
                </Button>
                <Button
                  variant={graphMode === "correctness" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGraphMode("correctness")}
                  data-testid="button-graph-correctness"
                >
                  Correctness
                </Button>
                <Button
                  variant={graphMode === "understanding" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setGraphMode("understanding")}
                  data-testid="button-graph-understanding"
                >
                  Understanding
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="examName"
                    tick={{ fontSize: 12 }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                    className="fill-muted-foreground"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`}
                    className="fill-muted-foreground"
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${value}%`, name === "correctness" ? "Correctness" : "Understanding"]}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Legend />
                  {(graphMode === "both" || graphMode === "correctness") && (
                    <Line
                      type="monotone"
                      dataKey="correctness"
                      name="Correctness"
                      stroke="hsl(142, 76%, 36%)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(142, 76%, 36%)" }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                  {(graphMode === "both" || graphMode === "understanding") && (
                    <Line
                      type="monotone"
                      dataKey="understanding"
                      name="Understanding"
                      stroke="hsl(217, 91%, 60%)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "hsl(217, 91%, 60%)" }}
                      activeDot={{ r: 6 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="space-y-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Exam Submissions
        </h4>

        {studentSubs.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">No submissions yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {studentSubs.map(sub => {
              const exam = exams.find(e => e.id === sub.examId);
              const isExpanded = expandedSubmission === sub.id;
              const hasProctoring = sub.proctoringFlags && sub.proctoringFlags.length > 0;
              const hasRecordings = sub.screenRecordingUrl || sub.webcamRecordingUrl;
              const suspicious = sub.isSuspicious === "true" || (sub.tabSwitchCount || 0) >= TAB_SWITCH_SUSPICIOUS_THRESHOLD;

              return (
                <Card
                  key={sub.id}
                  className={`transition-all ${suspicious ? "border-red-500 dark:border-red-600" : hasProctoring ? "border-amber-400 dark:border-amber-600" : ""}`}
                  data-testid={`card-submission-${sub.id}`}
                >
                  <CardContent className="p-4">
                    <div
                      className="flex items-center justify-between gap-3 cursor-pointer"
                      onClick={() => setExpandedSubmission(isExpanded ? null : sub.id)}
                      data-testid={`toggle-submission-${sub.id}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{exam?.title || "Unknown Exam"}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(parseISO(sub.submittedAt), "MMM d, yyyy h:mm a")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Correctness</p>
                          <p className={`text-sm font-bold ${getScoreColor(sub.totalScore)}`}>
                            {(sub.totalScore * 100).toFixed(0)}%
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Understanding</p>
                          <p className={`text-sm font-bold ${getScoreColor(sub.totalUnderstandingScore || 0)}`}>
                            {((sub.totalUnderstandingScore || 0) * 100).toFixed(0)}%
                          </p>
                        </div>
                        {suspicious && (
                          <Badge variant="destructive" className="text-xs" data-testid={`badge-suspicious-${sub.id}`}>
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            Suspicious
                          </Badge>
                        )}
                        {hasProctoring && !suspicious && (
                          <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {sub.tabSwitchCount || sub.proctoringFlags!.length} switch{(sub.tabSwitchCount || sub.proctoringFlags!.length) !== 1 ? "es" : ""}
                          </Badge>
                        )}
                        {hasRecordings && (
                          <Badge variant="outline" className="text-xs">
                            <Video className="h-3 w-3 mr-1" />
                            Recorded
                          </Badge>
                        )}
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-4">
                        {hasRecordings && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Recordings
                            </h5>
                            {sub.screenRecordingUrl ? (
                              <>
                                <div className="relative rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                                  <video
                                    src={sub.screenRecordingUrl}
                                    controls
                                    className="w-full h-full object-contain"
                                    data-testid={`video-screen-${sub.id}`}
                                  />
                                  {sub.webcamRecordingUrl && (
                                    <div className="absolute top-3 right-3 w-[160px] rounded-lg overflow-hidden border-2 border-white/30 shadow-lg" style={{ aspectRatio: "4/3" }}>
                                      <video
                                        src={sub.webcamRecordingUrl}
                                        controls
                                        muted
                                        className="w-full h-full object-cover"
                                        data-testid={`video-webcam-${sub.id}`}
                                      />
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Screen recording (main){sub.webcamRecordingUrl ? " with webcam overlay (top-right)" : ""}. Click to play.
                                </p>
                              </>
                            ) : sub.webcamRecordingUrl ? (
                              <>
                                <div className="rounded-lg overflow-hidden bg-black" style={{ aspectRatio: "4/3", maxWidth: "480px" }}>
                                  <video
                                    src={sub.webcamRecordingUrl}
                                    controls
                                    className="w-full h-full object-contain"
                                    data-testid={`video-webcam-${sub.id}`}
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Webcam recording only. No screen recording available.
                                </p>
                              </>
                            ) : null}
                          </div>
                        )}

                        {sub.feedback && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              AI Feedback
                            </h5>
                            <div className="grid gap-2">
                              {sub.feedback.strengths && (
                                <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Strengths</p>
                                  <p className="text-sm text-green-800 dark:text-green-300">{sub.feedback.strengths}</p>
                                </div>
                              )}
                              {sub.feedback.weakPoints && (
                                <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Areas to Improve</p>
                                  <p className="text-sm text-amber-800 dark:text-amber-300">{sub.feedback.weakPoints}</p>
                                </div>
                              )}
                              {sub.feedback.recommendations && (
                                <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                  <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Recommendations</p>
                                  <p className="text-sm text-blue-800 dark:text-blue-300">{sub.feedback.recommendations}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {exam && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4" />
                              Question Details
                            </h5>
                            <div className="space-y-2">
                              {exam.questions.map((q: Question, idx: number) => {
                                const response = sub.responses.find(r => r.questionId === q.id);
                                const correctnessScore = sub.scores?.[q.id!];
                                const understandingScore = sub.understandingScores?.[q.id!];
                                const gradingMethod = sub.gradingMethods?.[q.id!];

                                return (
                                  <div key={q.id || idx} className="p-3 rounded-md border space-y-2" data-testid={`question-detail-${q.id}`}>
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="text-sm font-medium">Q{idx + 1}: {q.text}</p>
                                      {gradingMethod && (
                                        <Badge variant={getGradingMethodVariant(gradingMethod)} className="text-xs flex-shrink-0">
                                          {getGradingMethodLabel(gradingMethod)}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="grid sm:grid-cols-2 gap-2 text-sm">
                                      <div>
                                        <p className="text-xs text-muted-foreground">Expected Answer</p>
                                        <p className="text-sm">{q.correctAnswer || "—"}</p>
                                      </div>
                                      <div>
                                        <p className="text-xs text-muted-foreground">Student Answer</p>
                                        <p className="text-sm">{response?.transcript || response?.response || "—"}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                      {correctnessScore !== undefined && (
                                        <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(correctnessScore)} ${getScoreColor(correctnessScore)}`}>
                                          Correctness: {(correctnessScore * 100).toFixed(0)}%
                                        </div>
                                      )}
                                      {understandingScore !== undefined && (
                                        <div className={`px-2 py-1 rounded text-xs font-medium ${getScoreBg(understandingScore)} ${getScoreColor(understandingScore)}`}>
                                          Understanding: {(understandingScore * 100).toFixed(0)}%
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {(hasProctoring || (sub.tabSwitchCount || 0) > 0) && (
                          <div className="space-y-2">
                            <h5 className={`text-sm font-medium flex items-center gap-2 ${suspicious ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {suspicious ? <ShieldAlert className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                              Proctoring Alerts
                            </h5>

                            <div className={`p-3 rounded-md border space-y-1 ${suspicious ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30" : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20"}`}>
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">Tab Switches: {sub.tabSwitchCount || sub.proctoringFlags?.length || 0}</p>
                                {suspicious && (
                                  <Badge variant="destructive" className="text-xs">
                                    <ShieldAlert className="h-3 w-3 mr-1" />
                                    Flagged
                                  </Badge>
                                )}
                              </div>
                              {sub.proctoringFlags && sub.proctoringFlags.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Total time away: {Math.round(sub.proctoringFlags.reduce((sum, f) => sum + (f.durationAway || 0), 0))}s across {sub.proctoringFlags.length} event{sub.proctoringFlags.length !== 1 ? "s" : ""}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => analyzeProctoring.mutate(sub.id)}
                                disabled={analyzeProctoring.isPending}
                                data-testid={`button-analyze-proctoring-${sub.id}`}
                              >
                                <Sparkles className="h-3 w-3 mr-1" />
                                {analyzeProctoring.isPending && analyzeProctoring.variables === sub.id ? "Analyzing..." : "AI Analysis"}
                              </Button>
                            </div>

                            {proctoringAnalysis[sub.id] && (
                              <div className={`p-3 rounded-md border space-y-1 ${
                                proctoringAnalysis[sub.id].includes("[HIGH RISK]") ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30" :
                                proctoringAnalysis[sub.id].includes("[MODERATE RISK]") ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" :
                                "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30"
                              }`}>
                                <p className="text-xs font-medium flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" />
                                  AI Proctoring Analysis
                                </p>
                                <p className="text-sm">{proctoringAnalysis[sub.id]}</p>
                              </div>
                            )}

                            {hasProctoring && (
                              <div className="space-y-2">
                                {sub.proctoringFlags!.map((flag, idx) => (
                                  <div key={idx} className="p-3 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <Badge variant="destructive" className="text-xs">
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Tab Switch #{idx + 1}
                                      </Badge>
                                      <div className="flex items-center gap-2">
                                        {flag.durationAway && (
                                          <span className="text-xs text-muted-foreground">
                                            Away {flag.durationAway}s
                                          </span>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                          {format(parseISO(flag.timestamp), "h:mm:ss a")}
                                        </span>
                                      </div>
                                    </div>
                                    {flag.aiVerdict && (
                                      <p className="text-sm text-amber-800 dark:text-amber-300">{flag.aiVerdict}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
