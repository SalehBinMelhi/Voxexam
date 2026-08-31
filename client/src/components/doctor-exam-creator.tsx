import { useState } from "react";
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
import { Switch } from "@/components/ui/switch";
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  Copy,
  Edit,
  Trash,
  Plus,
  BookOpen,
  Send,
  Layers,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ExamBlueprint, ExamBlueprintTopic, ExamBlueprintConcept } from "@/../../server/gemini";

interface DoctorExamCreatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExamCreated?: () => void;
}

export function DoctorExamCreator({ open, onOpenChange, onExamCreated }: DoctorExamCreatorProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"form" | "upload" | "blueprint" | "published">("form");

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [maxFollowUps, setMaxFollowUps] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [showScore, setShowScore] = useState(true);

  // Exam state
  const [examId, setExamId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleCreateExam = async () => {
    if (!title.trim()) {
      toast({ title: "Title Required", description: "Please enter an exam title.", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch("/api/adaptive-exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          subjectName,
          maxQuestions,
          maxFollowUpsPerConcept: maxFollowUps,
          durationMinutes,
          passingScore,
          showFinalScoreImmediately: showScore,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create exam");

      setExamId(data.id);
      setAccessCode(data.accessCode);
      setStep("upload");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleUploadMaterials = async () => {
    if (!examId || files.length === 0) {
      toast({ title: "Files Required", description: "Please select at least one lecture file to upload.", variant: "destructive" });
      return;
    }

    try {
      setIsAnalyzing(true);
      const formData = new FormData();
      files.forEach((f) => formData.append("materials", f));

      const res = await fetch(`/api/adaptive-exams/${examId}/upload-material`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Material analysis failed");

      setBlueprint(data.blueprint);
      setStep("blueprint");
      toast({ title: "Analysis Complete", description: "Google Gemini successfully extracted concepts and rubric points." });
    } catch (err: any) {
      toast({ title: "Analysis Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePublishExam = async () => {
    if (!examId || !blueprint) return;
    try {
      const res = await fetch(`/api/adaptive-exams/${examId}/blueprint`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprint,
          status: "active",
        }),
      });

      if (!res.ok) throw new Error("Failed to publish exam");
      setStep("published");
      if (onExamCreated) onExamCreated();
      toast({ title: "Exam Published", description: `Unique Access Code: ${accessCode}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const copyCode = () => {
    if (accessCode) {
      navigator.clipboard.writeText(accessCode);
      toast({ title: "Copied!", description: "Access code copied to clipboard." });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Adaptive Oral Exam (Doctor Portal)
          </DialogTitle>
          <DialogDescription>
            Upload lecture materials to let Google Gemini build an adaptive oral exam blueprint.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: FORM */}
        {step === "form" && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Exam Title *</Label>
              <Input placeholder="e.g. Data Structures & Algorithms Oral Exam" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject / Course Name</Label>
                <Input placeholder="e.g. CS 301" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Exam Duration (Minutes)</Label>
                <Input type="number" min={5} max={180} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description / Instructions</Label>
              <Textarea placeholder="Instructions for students..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid grid-cols-2 gap-4 border p-3 rounded-md bg-muted/30">
              <div className="space-y-2">
                <Label>Max Questions Limit</Label>
                <Input type="number" min={3} max={30} value={maxQuestions} onChange={(e) => setMaxQuestions(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Max Follow-ups per Concept</Label>
                <Input type="number" min={1} max={5} value={maxFollowUps} onChange={(e) => setMaxFollowUps(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border p-3 rounded-md">
              <div className="space-y-0.5">
                <Label htmlFor="show-creator-diagnostic-report">Show Preliminary AI Report Immediately</Label>
                <p id="show-creator-diagnostic-report-help" className="text-xs text-muted-foreground">
                  When enabled, students see the AI diagnostic score and feedback after submitting. Their official result remains hidden until you review and publish it.
                </p>
              </div>
              <Switch
                id="show-creator-diagnostic-report"
                checked={showScore}
                onCheckedChange={setShowScore}
                aria-describedby="show-creator-diagnostic-report-help"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreateExam}>Next: Upload Materials</Button>
            </div>
          </div>
        )}

        {/* STEP 2: UPLOAD MATERIALS */}
        {step === "upload" && (
          <div className="space-y-6 py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" /> Upload Lecture / Course Materials
                </CardTitle>
                <CardDescription>Upload your PDF lecture materials (Text or Scanned).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  multiple
                  accept="application/pdf,.pdf"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />

                {files.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Selected Files:</Label>
                    {files.map((f, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-muted p-2 rounded-md">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStep("form")} disabled={isAnalyzing}>Back</Button>
              <Button onClick={handleUploadMaterials} disabled={isAnalyzing || files.length === 0}>
                {isAnalyzing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                    Gemini Analyzing Material...
                  </>
                ) : (
                  <>Analyze with Gemini & Build Blueprint</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & EDIT BLUEPRINT */}
        {step === "blueprint" && blueprint && (
          <div className="space-y-6 py-2">
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-primary" /> Course Material Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {blueprint.summary}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Generated Topics & Concepts Blueprint
              </h4>

              {blueprint.topics?.map((topic, tIdx) => (
                <Card key={tIdx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-primary">{topic.title}</CardTitle>
                    <CardDescription>{topic.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {topic.concepts?.map((concept, cIdx) => (
                      <div key={cIdx} className="border p-3 rounded-md bg-muted/30 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <Badge variant="outline" className="text-xs mb-1">{concept.difficulty}</Badge>
                            <h5 className="font-semibold text-sm">{concept.title}</h5>
                            <p className="text-xs text-muted-foreground">{concept.description}</p>
                          </div>
                        </div>

                        <div className="text-xs space-y-1">
                          <div><strong>Expected Key Points:</strong> {concept.expectedKeyPoints?.join(", ")}</div>
                          <div><strong>Common Misconceptions:</strong> {concept.commonMisconceptions?.join(", ")}</div>
                          <div className="text-primary"><strong>Suggested Initial Question:</strong> "{concept.suggestedInitialQuestion}"</div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back to Upload</Button>
              <Button onClick={handlePublishExam} className="gap-2">
                <CheckCircle2 className="h-4 w-4" /> Approve & Publish Exam
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: PUBLISHED & ACCESS CODE */}
        {step === "published" && accessCode && (
          <div className="space-y-6 py-6 text-center">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold">Exam Published Successfully!</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Share this 5-digit unique access code with your students to let them join the adaptive oral exam.
            </p>

            <div className="flex items-center justify-center gap-3 bg-muted p-4 rounded-lg max-w-xs mx-auto border">
              <span className="text-3xl font-black font-mono tracking-widest text-primary">{accessCode}</span>
              <Button variant="ghost" size="icon" onClick={copyCode} title="Copy Code">
                <Copy className="h-5 w-5" />
              </Button>
            </div>

            <div className="pt-4 flex justify-center">
              <Button onClick={() => onOpenChange(false)}>Return to Dashboard</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
