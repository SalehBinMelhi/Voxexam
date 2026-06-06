import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Exam, ExamSubmission, ProfessorDecision } from "@shared/schema";
import { cn } from "@/lib/utils";

function scoreToPercent(score: number | null | undefined) {
  return Math.round((score ?? 0) * 100);
}

function aiSuggestedPercent(submission: ExamSubmission) {
  return Math.round(submission.voxScoreProfile?.totalScore ?? submission.totalScore * 100);
}

function isArabicOrMixed(submission: ExamSubmission) {
  const language = (
    submission.languageUsed ||
    submission.voxScoreProfile?.languageDetected ||
    ""
  ).toLowerCase();
  return language === "arabic" || language === "mixed";
}

export function ProfessorReviewIndicators({ submission }: { submission: ExamSubmission }) {
  const gap = typeof submission.gradingGap === "number" ? submission.gradingGap : null;
  const threshold = isArabicOrMixed(submission) ? 6 : 8;
  const isLargeGap = gap !== null && Math.abs(gap) > threshold;

  if (gap === null && !submission.arabicFlag && !submission.voxScoreProfile) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid={`review-indicators-${submission.id}`}>
      <Badge
        variant="outline"
        className={cn(
          "text-xs",
          isLargeGap && "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
        )}
        data-testid={`badge-grading-gap-${submission.id}`}
      >
        AI suggested {aiSuggestedPercent(submission)}/100
        {gap !== null ? `, gap: ${gap >= 0 ? "+" : ""}${gap}` : ""}
      </Badge>
      {submission.arabicFlag && (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          data-testid={`badge-arabic-flag-${submission.id}`}
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          Arabic/Mixed — human review recommended
        </Badge>
      )}
    </div>
  );
}

interface ProfessorDecisionPanelProps {
  exam: Exam;
  submission: ExamSubmission;
  onViewEvidence?: () => void;
}

export function ProfessorDecisionPanel({
  exam,
  submission,
  onViewEvidence,
}: ProfessorDecisionPanelProps) {
  const { toast } = useToast();
  const [decisionChoice, setDecisionChoice] = useState<ProfessorDecision | null>(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [holisticScore, setHolisticScore] = useState("");
  const [showReasonPrompt, setShowReasonPrompt] = useState(false);
  const [reasonPromptShown, setReasonPromptShown] = useState(false);
  const [expandedAt, setExpandedAt] = useState(() => Date.now());
  const [adjustedScores, setAdjustedScores] = useState<Record<string, string>>({});

  const aiTotalScore = useMemo(() => {
    if (submission.voxScoreProfile?.totalScore != null) {
      return submission.voxScoreProfile.totalScore / 100;
    }
    return submission.totalScore;
  }, [submission.totalScore, submission.voxScoreProfile]);

  useEffect(() => {
    setDecisionChoice((submission.professorDecision as ProfessorDecision | null) || null);
    setDecisionReason(submission.professorOverrideReason || "");
    setHolisticScore(submission.professorHolisticScore != null ? String(submission.professorHolisticScore) : "");
    setShowReasonPrompt(false);
    setReasonPromptShown(false);
    setExpandedAt(Date.now());
    setAdjustedScores(
      Object.fromEntries(
        submission.responses.map((resp) => [
          resp.questionId,
          String(scoreToPercent(submission.scores[resp.questionId] || 0)),
        ])
      )
    );
  }, [
    submission.id,
    submission.professorDecision,
    submission.professorHolisticScore,
    submission.professorOverrideReason,
    submission.responses,
    submission.scores,
  ]);

  const saveDecisionMutation = useMutation({
    mutationFn: async () => {
      if (!decisionChoice) {
        throw new Error("Choose a decision first.");
      }

      let parsedAdjustedScores: Record<string, number> | undefined;
      if (decisionChoice === "adjusted" || decisionChoice === "overridden") {
        parsedAdjustedScores = {};
        for (const resp of submission.responses) {
          const raw = adjustedScores[resp.questionId] ?? "0";
          const scorePercent = Number(raw);
          if (!Number.isFinite(scorePercent) || scorePercent < 0 || scorePercent > 100) {
            throw new Error("Scores must be between 0 and 100.");
          }
          parsedAdjustedScores[resp.questionId] = scorePercent / 100;
        }
      }

      const durationMinutes = Math.max(0, Math.round(((Date.now() - expandedAt) / 60000) * 10) / 10);
      const response = await apiRequest("PATCH", `/api/submissions/${submission.id}/decision`, {
        professorDecision: decisionChoice,
        professorOverrideReason: decisionChoice === "accepted" ? undefined : (decisionReason.trim() || undefined),
        professorHolisticScore: exam.mode === "exam" && holisticScore.trim() !== "" ? Number(holisticScore) : undefined,
        professorReviewDurationMinutes: durationMinutes,
        adjustedScores: parsedAdjustedScores,
        aiTotalScore,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/submissions"] });
      toast({
        title: "Decision saved",
        description: "Your review has been recorded.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Decision not saved",
        description: error.message || "Failed to save decision.",
        variant: "destructive",
      });
    },
  });

  const handleSaveDecision = () => {
    const needsReason = decisionChoice === "adjusted" || decisionChoice === "overridden";
    if (needsReason && decisionReason.trim() === "" && !reasonPromptShown) {
      setReasonPromptShown(true);
      setShowReasonPrompt(true);
      return;
    }
    setShowReasonPrompt(false);
    saveDecisionMutation.mutate();
  };

  const setDecision = (decision: ProfessorDecision) => {
    setDecisionChoice(decision);
    setShowReasonPrompt(false);
    if ((decision === "adjusted" || decision === "overridden") && onViewEvidence) {
      onViewEvidence();
    }
  };

  return (
    <div className="space-y-3 rounded-md border p-3" data-testid={`decision-panel-${submission.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h5 className="flex items-center gap-1.5 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            Professor decision / قرار الأستاذ
          </h5>
          <p className="text-[10px] text-muted-foreground">
            Record your judgment of the AI-suggested score. Nothing is released until you approve.
          </p>
          <p className="text-[10px] text-muted-foreground" dir="rtl">
            سجّل حكمك على الدرجة المقترحة من الذكاء الاصطناعي. لا يتم إصدار أي نتيجة قبل موافقتك.
          </p>
        </div>
        <ProfessorReviewIndicators submission={submission} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={decisionChoice === "accepted" ? "default" : "outline"}
          onClick={() => setDecision("accepted")}
          data-testid={`button-decision-accept-${submission.id}`}
        >
          Accept / اعتماد
        </Button>
        <Button
          size="sm"
          variant={decisionChoice === "adjusted" ? "default" : "outline"}
          onClick={() => setDecision("adjusted")}
          data-testid={`button-decision-adjust-${submission.id}`}
        >
          Adjust / تعديل
        </Button>
        <Button
          size="sm"
          variant={decisionChoice === "overridden" ? "default" : "outline"}
          onClick={() => setDecision("overridden")}
          data-testid={`button-decision-override-${submission.id}`}
        >
          Override / استبدال
        </Button>
      </div>

      {decisionChoice === "accepted" && (
        <p className="text-[10px] text-muted-foreground" data-testid={`text-decision-accept-hint-${submission.id}`}>
          Records agreement with the AI score. / تأكيد الموافقة على الدرجة المقترحة.
        </p>
      )}

      {(decisionChoice === "adjusted" || decisionChoice === "overridden") && (
        <div className="space-y-2 rounded-md bg-muted/40 p-3" data-testid={`decision-score-editor-${submission.id}`}>
          <p className="text-[10px] text-muted-foreground">
            Enter professor-reviewed scores here. These replace the inline pencil edit flow.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {submission.responses.map((resp, idx) => {
              const question = exam.questions.find((q) => q.id === resp.questionId);
              return (
                <div key={resp.questionId} className="space-y-1 rounded-md border bg-background p-2">
                  <Label htmlFor={`score-${submission.id}-${resp.questionId}`} className="text-[10px]">
                    Q{idx + 1}: {question?.text || "Unknown question"}
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id={`score-${submission.id}-${resp.questionId}`}
                      type="number"
                      min="0"
                      max="100"
                      value={adjustedScores[resp.questionId] ?? ""}
                      onChange={(event) =>
                        setAdjustedScores((prev) => ({
                          ...prev,
                          [resp.questionId]: event.target.value,
                        }))
                      }
                      className="h-7 w-20 text-xs"
                      data-testid={`input-decision-score-${submission.id}-${resp.questionId}`}
                    />
                    <span className="text-[10px] text-muted-foreground">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(decisionChoice === "adjusted" || decisionChoice === "overridden") && (
        <div className="space-y-1">
          <Label htmlFor={`reason-${submission.id}`} className="text-[10px]">
            Reason for adjustment (optional but encouraged)
          </Label>
          <Textarea
            id={`reason-${submission.id}`}
            value={decisionReason}
            onChange={(event) => setDecisionReason(event.target.value)}
            placeholder="Explain why you changed the AI score."
            className="min-h-[60px] text-xs"
            data-testid={`textarea-decision-reason-${submission.id}`}
          />
        </div>
      )}

      {exam.mode === "exam" && (
        <div className="space-y-1">
          <Label htmlFor={`holistic-${submission.id}`} className="text-[10px]">
            Holistic impression (1-10) — not part of the official score
          </Label>
          <Input
            id={`holistic-${submission.id}`}
            type="number"
            min="1"
            max="10"
            value={holisticScore}
            onChange={(event) => setHolisticScore(event.target.value)}
            className="h-7 w-20 text-xs"
            data-testid={`input-holistic-${submission.id}`}
          />
        </div>
      )}

      {showReasonPrompt && decisionReason.trim() === "" && (decisionChoice === "adjusted" || decisionChoice === "overridden") && (
        <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20" data-testid={`prompt-reason-${submission.id}`}>
          <p className="text-[10px] text-amber-800 dark:text-amber-300">
            Adding a reason helps improve AI accuracy over time. Skip anyway?
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowReasonPrompt(false)} data-testid={`button-add-reason-${submission.id}`}>
              Add reason
            </Button>
            <Button
              size="sm"
              onClick={() => saveDecisionMutation.mutate()}
              disabled={saveDecisionMutation.isPending}
              data-testid={`button-skip-reason-${submission.id}`}
            >
              Skip
            </Button>
          </div>
        </div>
      )}

      <Button
        size="sm"
        onClick={handleSaveDecision}
        disabled={!decisionChoice || saveDecisionMutation.isPending}
        data-testid={`button-save-decision-${submission.id}`}
      >
        {saveDecisionMutation.isPending ? "Saving..." : "Save Decision / حفظ القرار"}
      </Button>

      {submission.professorReviewTimestamp && (
        <p className="text-[10px] text-muted-foreground" data-testid={`text-decision-saved-${submission.id}`}>
          Last reviewed {format(new Date(submission.professorReviewTimestamp), "MMM d, yyyy h:mm a")}
          {submission.professorDecision ? ` — ${submission.professorDecision}` : ""}
        </p>
      )}
    </div>
  );
}
