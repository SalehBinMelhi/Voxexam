import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Award,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  User,
  Volume2,
  Edit,
  Save,
  RotateCcw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DoctorAttemptReviewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attemptId: string | null;
  onOverrideSaved?: () => void;
}

export function DoctorAttemptReviewer({
  open,
  onOpenChange,
  attemptId,
  onOverrideSaved,
}: DoctorAttemptReviewerProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  // Score override state
  const [doctorFinalScore, setDoctorFinalScore] = useState<number | "">("");
  const [overrideReason, setOverrideReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (attemptId && open) {
      fetchAttempt();
    }
  }, [attemptId, open]);

  const fetchAttempt = async () => {
    if (!attemptId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/adaptive-attempts/${attemptId}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to load attempt");

      setData(result);
      if (result.attempt) {
        setDoctorFinalScore(
          result.attempt.doctorFinalScore !== null && result.attempt.doctorFinalScore !== undefined
            ? result.attempt.doctorFinalScore
            : result.attempt.finalScore ?? result.attempt.totalScore
        );
        setOverrideReason(result.attempt.professorOverrideReason || "");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!attemptId) return;
    try {
      setIsSaving(true);
      const res = await fetch(`/api/adaptive-attempts/${attemptId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorFinalScore: doctorFinalScore !== "" ? Number(doctorFinalScore) : undefined,
          reason: overrideReason,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to save override");

      toast({ title: "Score Override Preserved", description: "Original AI score and Doctor override score were saved successfully." });
      if (onOverrideSaved) onOverrideSaved();
      fetchAttempt();
    } catch (err: any) {
      toast({ title: "Save Error", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  const attempt = data?.attempt;
  const exam = data?.exam;
  const originalScore = attempt?.finalScore ?? attempt?.totalScore ?? 0;
  const currentDocScore = attempt?.doctorFinalScore;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" />
            Doctor Review & Score Override Interface
          </DialogTitle>
          <DialogDescription>
            Review student audio recordings, AI transcripts, covered points, and adjust scores. Original AI scores are permanently preserved.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
            <span>Loading Student Attempt...</span>
          </div>
        ) : !attempt ? (
          <div className="py-6 text-center text-muted-foreground">Attempt not found.</div>
        ) : (
          <div className="space-y-6 py-2">
            {/* ATTEMPT METADATA HEADER */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border p-4 rounded-lg bg-card">
              <div>
                <Label className="text-xs text-muted-foreground">Student Identity</Label>
                <div className="font-semibold text-sm flex items-center gap-1.5 mt-0.5">
                  <User className="h-4 w-4 text-primary" /> {attempt.studentId || "Student"}
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Exam Title</Label>
                <div className="font-semibold text-sm mt-0.5">{exam?.title || "Oral Exam"}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Submitted At</Label>
                <div className="font-semibold text-sm mt-0.5 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {attempt.submittedAt?.slice(0, 16)}
                </div>
              </div>
            </div>

            {/* SCORES SUMMARY & OVERRIDE CONTROLS */}
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Overall Exam Score Summary
                  </span>
                  {currentDocScore !== null && currentDocScore !== undefined && (
                    <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 border-amber-500/30">
                      Doctor Overridden
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border p-3 rounded-md bg-background text-center">
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Original AI Score</span>
                    <div className="text-3xl font-bold text-primary mt-1">{originalScore} / 100</div>
                  </div>

                  <div className="border p-3 rounded-md bg-background text-center">
                    <span className="text-xs text-muted-foreground uppercase font-semibold">Doctor Adjusted Score</span>
                    <div className="text-3xl font-bold text-emerald-600 mt-1">
                      {currentDocScore !== null && currentDocScore !== undefined ? currentDocScore : originalScore} / 100
                    </div>
                  </div>
                </div>

                {/* OVERRIDE INPUT FORM */}
                <div className="border p-3 rounded-md bg-background space-y-3">
                  <h4 className="font-semibold text-xs text-primary flex items-center gap-1">
                    <Edit className="h-3.5 w-3.5" /> Adjust Score & Save Reason
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">New Doctor Final Score (0-100)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={doctorFinalScore}
                        onChange={(e) => setDoctorFinalScore(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">Override Reason / Academic Note</Label>
                      <Input
                        placeholder="e.g. Student explained the key concept orally despite non-standard phrasing."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" onClick={handleSaveOverride} disabled={isSaving} className="gap-1">
                      <Save className="h-3.5 w-3.5" /> Save Score Override
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ADAPTIVE QUESTIONS & AUDIO ANSWERS LOG */}
            <div className="space-y-4">
              <h4 className="font-semibold text-sm">Adaptive Questions & Student Audio Log</h4>

              {attempt.questionLogs?.map((log: any, idx: number) => (
                <Card key={idx} className="border">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="text-xs">Q{idx + 1}: {log.conceptTitle || "Concept"}</Badge>
                      {log.score !== undefined && (
                        <Badge variant="secondary">AI Score: {log.score}/100</Badge>
                      )}
                    </div>
                    <CardTitle className="text-sm font-semibold mt-1">{log.question}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs">
                    {/* Audio Player if recorded */}
                    {log.audioBase64 && (
                      <div className="p-2 bg-muted rounded-md flex items-center gap-2">
                        <Volume2 className="h-4 w-4 text-primary" />
                        <audio src={`data:audio/webm;base64,${log.audioBase64}`} controls className="w-full h-8" />
                      </div>
                    )}

                    <div>
                      <strong>Transcript:</strong>
                      <p className="text-muted-foreground bg-muted/40 p-2 rounded mt-0.5">{log.transcript || "No transcript available."}</p>
                    </div>

                    {log.coveredKeyPoints?.length > 0 && (
                      <div className="text-emerald-700">
                        <strong>Covered Points:</strong> {log.coveredKeyPoints.join(", ")}
                      </div>
                    )}

                    {log.missingKeyPoints?.length > 0 && (
                      <div className="text-amber-700">
                        <strong>Missing Points:</strong> {log.missingKeyPoints.join(", ")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
