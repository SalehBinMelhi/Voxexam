import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import {
  Sparkles,
  Upload,
  FileText,
  CheckCircle2,
  Copy,
  Edit,
  Trash2,
  Plus,
  BookOpen,
  Send,
  Layers,
  RotateCcw,
  Eye,
  EyeOff,
  Save,
  Mic,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Exam, University } from "@shared/schema";

interface ExamBlueprintConcept {
  id: string;
  title: string;
  description: string;
  learningObjectives: string[];
  expectedKeyPoints: string[];
  commonMisconceptions: string[];
  difficulty: "basic" | "intermediate" | "advanced";
  suggestedInitialQuestion: string;
  enabled?: boolean;
}

interface ExamBlueprintTopic {
  id: string;
  title: string;
  description: string;
  importance: number;
  concepts: ExamBlueprintConcept[];
}

interface ExamBlueprint {
  summary: string;
  courseName: string;
  topics: ExamBlueprintTopic[];
}

export function AdaptiveExamTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [_, setLocation] = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step: "form" | "upload" | "analyzing" | "blueprint" | "published"
  const [step, setStep] = useState<"form" | "upload" | "analyzing" | "blueprint" | "published">("form");

  // Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [maxQuestions, setMaxQuestions] = useState(10);
  const [maxFollowUps, setMaxFollowUps] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [showScore, setShowScore] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState<string>("none");

  // Exam state
  const [examId, setExamId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<ExamBlueprint | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Editing state
  const [editingConcept, setEditingConcept] = useState<{ topicIdx: number; conceptIdx: number } | null>(null);

  // Data fetching
  const { data: userUniversity } = useQuery<University>({
    queryKey: ["/api/universities", user?.universityId],
    enabled: !!user?.universityId,
  });

  const { data: classes = [] } = useQuery<any[]>({
    queryKey: ["/api/classes"],
  });

  const { data: allExams = [] } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });
  const adaptiveExams = allExams.filter(e => e.mode === "adaptive" && !e.classId);

  const handleCreateExam = async () => {
    if (!title.trim()) {
      toast({ title: "Title Required", description: "Please enter an exam title.", variant: "destructive" });
      return;
    }

    try {
      const reqBody: any = {
        title: title.trim(),
        description: description.trim(),
        subjectName: subjectName.trim(),
        mode: "adaptive",
        status: "draft",
        maxQuestions,
        maxFollowUpsPerConcept: maxFollowUps,
        durationMinutes,
        passingScore,
        showFinalScoreImmediately: showScore,
        classId: selectedClassId && selectedClassId !== "none" ? selectedClassId : null,
      };

      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(reqBody),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create exam");

      setExamId(data.id);
      setAccessCode(data.accessCode);
      setStep("upload");
      toast({ title: "Exam Draft Created", description: "Now upload your lecture materials." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleSaveDraft = () => {
    if (!title.trim()) {
      toast({ title: "Title Required", description: "Please enter an exam title to save.", variant: "destructive" });
      return;
    }
    // If already created, it's already saved as draft
    if (examId) {
      toast({ title: "Draft Saved", description: "Your exam draft is saved." });
    } else {
      handleCreateExam();
    }
  };

  const handleUploadMaterials = async () => {
    if (!examId || files.length === 0) {
      toast({ title: "Files Required", description: "Please select at least one lecture file to upload.", variant: "destructive" });
      return;
    }

    try {
      setIsAnalyzing(true);
      setStep("analyzing");
      const formData = new FormData();
      files.forEach((f) => formData.append("materials", f));

      const res = await fetch(`/api/adaptive-exams/${examId}/upload-material`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Material analysis failed");

      setBlueprint(data.blueprint);
      setStep("blueprint");
      toast({ title: "Analysis Complete", description: "Gemini successfully extracted concepts and rubric points." });
    } catch (err: any) {
      toast({ title: "Analysis Failed", description: err.message, variant: "destructive" });
      setStep("upload");
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
        credentials: "include",
        body: JSON.stringify({
          blueprint,
          status: "active",
          maxQuestions,
          maxFollowUpsPerConcept: maxFollowUps,
          durationMinutes,
        }),
      });

      if (!res.ok) throw new Error("Failed to publish exam");
      setStep("published");
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      toast({ title: "Exam Published!", description: `Access Code: ${accessCode}` });
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

  const updateConceptField = (topicIdx: number, conceptIdx: number, field: string, value: any) => {
    if (!blueprint) return;
    const updated = { ...blueprint };
    const topics = [...updated.topics];
    const concepts = [...topics[topicIdx].concepts];
    concepts[conceptIdx] = { ...concepts[conceptIdx], [field]: value };
    topics[topicIdx] = { ...topics[topicIdx], concepts };
    updated.topics = topics;
    setBlueprint(updated);
  };

  const toggleConcept = (topicIdx: number, conceptIdx: number) => {
    if (!blueprint) return;
    const current = blueprint.topics[topicIdx].concepts[conceptIdx].enabled !== false;
    updateConceptField(topicIdx, conceptIdx, "enabled", !current);
  };

  const resetForm = () => {
    setStep("form");
    setTitle("");
    setDescription("");
    setSubjectName("");
    setMaxQuestions(10);
    setMaxFollowUps(2);
    setDurationMinutes(30);
    setPassingScore(60);
    setShowScore(true);
    setSelectedClassId("none");
    setExamId(null);
    setAccessCode(null);
    setBlueprint(null);
    setFiles([]);
    setEditingConcept(null);
  };

  return (
    <div className="space-y-6">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        {["Setup", "Upload Materials", "Review Blueprint", "Published"].map((label, idx) => {
          const stepOrder = ["form", "upload", "blueprint", "published"];
          const currentIdx = stepOrder.indexOf(step === "analyzing" ? "upload" : step);
          const isActive = idx <= currentIdx;
          return (
            <div key={label} className="flex items-center gap-2">
              {idx > 0 && <div className={`w-8 h-0.5 ${isActive ? "bg-primary" : "bg-muted"}`} />}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isActive ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-muted-foreground"}`}>
                  {idx < currentIdx ? "✓" : idx + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* STEP 1: FORM */}
      {step === "form" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create Adaptive Oral Exam
            </CardTitle>
            <CardDescription>
              Upload lecture materials and let Gemini AI build an adaptive oral exam blueprint with intelligent follow-up questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Exam Title *</Label>
              <Input placeholder="e.g. Data Structures & Algorithms Oral Exam" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-adaptive-title" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject / Course Name</Label>
                <Input placeholder="e.g. CS 301" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Exam Duration (Minutes)</Label>
                <Input type="number" min={5} max={180} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} />
              </div>
            </div>

            {classes.length > 0 && (
              <div className="space-y-2">
                <Label>Class</Label>
                <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                  <SelectTrigger data-testid="select-adaptive-class">
                    <SelectValue placeholder="Select a class..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No class</SelectItem>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>{cls.subjectName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select a class to link this exam to a specific class roster</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Description / Instructions</Label>
              <Textarea placeholder="Instructions for students..." value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border p-4 rounded-md bg-muted/30">
              <div className="space-y-2">
                <Label>Max Questions</Label>
                <Input type="number" min={3} max={30} value={maxQuestions} onChange={(e) => setMaxQuestions(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Max Follow-ups / Concept</Label>
                <Input type="number" min={1} max={5} value={maxFollowUps} onChange={(e) => setMaxFollowUps(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Passing Score (%)</Label>
                <Input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} />
              </div>
            </div>

            <div className="flex items-center justify-between border p-3 rounded-md">
              <div className="space-y-0.5">
                <Label>Show Final Score Immediately</Label>
                <p className="text-xs text-muted-foreground">Allows student to see final diagnostic report right after submitting.</p>
              </div>
              <Switch checked={showScore} onCheckedChange={setShowScore} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleSaveDraft} className="gap-2">
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              <Button onClick={handleCreateExam} className="gap-2" data-testid="button-adaptive-next">
                Next: Upload Materials
                <Upload className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: UPLOAD MATERIALS */}
      {(step === "upload" || step === "analyzing") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Lecture / Course Materials
            </CardTitle>
            <CardDescription>Upload your PDF lecture materials (Text or Scanned).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
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

            {step === "analyzing" && (
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="text-sm font-medium">Gemini is analyzing your materials...</p>
                  <p className="text-xs text-muted-foreground">This may take 30-60 seconds depending on file size.</p>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep("form")} disabled={isAnalyzing}>
                Back
              </Button>
              <Button onClick={handleUploadMaterials} disabled={isAnalyzing || files.length === 0} className="gap-2" data-testid="button-analyze-material">
                {isAnalyzing ? (
                  <>
                    <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Analyze with Gemini
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: REVIEW & EDIT BLUEPRINT */}
      {step === "blueprint" && blueprint && (
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Course Material Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{blueprint.summary}</p>
              {blueprint.courseName && (
                <Badge variant="secondary" className="mt-2">{blueprint.courseName}</Badge>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                Generated Topics & Concepts Blueprint
              </h4>
              <Badge variant="outline">
                {blueprint.topics.reduce((acc, t) => acc + t.concepts.filter(c => c.enabled !== false).length, 0)} active concepts
              </Badge>
            </div>

            {blueprint.topics?.map((topic, tIdx) => (
              <Card key={tIdx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-primary">{topic.title}</CardTitle>
                  <CardDescription>{topic.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {topic.concepts?.map((concept, cIdx) => {
                    const isEditing = editingConcept?.topicIdx === tIdx && editingConcept?.conceptIdx === cIdx;
                    const isDisabled = concept.enabled === false;

                    return (
                      <div key={cIdx} className={`border p-3 rounded-md space-y-2 transition-opacity ${isDisabled ? "opacity-50 bg-muted/20" : "bg-muted/30"}`}>
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">{concept.difficulty}</Badge>
                              {isDisabled && <Badge variant="destructive" className="text-xs">Disabled</Badge>}
                            </div>
                            {isEditing ? (
                              <div className="space-y-2">
                                <Input
                                  value={concept.title}
                                  onChange={(e) => updateConceptField(tIdx, cIdx, "title", e.target.value)}
                                  className="text-sm font-semibold"
                                />
                                <Textarea
                                  value={concept.description}
                                  onChange={(e) => updateConceptField(tIdx, cIdx, "description", e.target.value)}
                                  rows={2}
                                  className="text-xs"
                                />
                                <div className="space-y-1">
                                  <Label className="text-xs">Expected Key Points (comma-separated)</Label>
                                  <Input
                                    value={concept.expectedKeyPoints?.join(", ") || ""}
                                    onChange={(e) => updateConceptField(tIdx, cIdx, "expectedKeyPoints", e.target.value.split(",").map(s => s.trim()).filter(Boolean))}
                                    className="text-xs"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Suggested Initial Question</Label>
                                  <Textarea
                                    value={concept.suggestedInitialQuestion}
                                    onChange={(e) => updateConceptField(tIdx, cIdx, "suggestedInitialQuestion", e.target.value)}
                                    rows={2}
                                    className="text-xs"
                                  />
                                </div>
                                <Button size="sm" variant="outline" onClick={() => setEditingConcept(null)} className="text-xs">
                                  Done Editing
                                </Button>
                              </div>
                            ) : (
                              <>
                                <h5 className="font-semibold text-sm">{concept.title}</h5>
                                <p className="text-xs text-muted-foreground">{concept.description}</p>
                              </>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setEditingConcept(isEditing ? null : { topicIdx: tIdx, conceptIdx: cIdx })}
                              title="Edit concept"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => toggleConcept(tIdx, cIdx)}
                              title={isDisabled ? "Enable concept" : "Disable concept"}
                            >
                              {isDisabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {!isEditing && !isDisabled && (
                          <div className="text-xs space-y-1">
                            <div><strong>Expected Key Points:</strong> {concept.expectedKeyPoints?.join(", ")}</div>
                            <div><strong>Common Misconceptions:</strong> {concept.commonMisconceptions?.join(", ")}</div>
                            <div className="text-primary"><strong>Suggested Question:</strong> "{concept.suggestedInitialQuestion}"</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep("upload")} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Re-upload Materials
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleSaveDraft} className="gap-2">
                <Save className="h-4 w-4" />
                Save Draft
              </Button>
              <Button onClick={handlePublishExam} className="gap-2" data-testid="button-publish-adaptive">
                <CheckCircle2 className="h-4 w-4" />
                Approve & Publish Exam
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: PUBLISHED */}
      {step === "published" && accessCode && (
        <Card>
          <CardContent className="py-12 text-center space-y-6">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-bold">Exam Published Successfully!</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Share this unique access code with your students to let them join the adaptive oral exam.
            </p>

            <div className="flex items-center justify-center gap-3 bg-muted p-4 rounded-lg max-w-xs mx-auto border">
              <span className="text-3xl font-black font-mono tracking-widest text-primary">{accessCode}</span>
              <Button variant="ghost" size="icon" onClick={copyCode} title="Copy Code" data-testid="button-copy-code">
                <Copy className="h-5 w-5" />
              </Button>
            </div>

            <div className="pt-4 flex justify-center">
              <Button onClick={resetForm} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Another Exam
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Adaptive Exams list */}
      {adaptiveExams.length > 0 && (
        <>
          <Separator />
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Mic className="h-4 w-4 text-primary" />
              Your Adaptive Oral Exams
            </h3>
            <div className="grid gap-3">
              {adaptiveExams.map((exam) => (
                <Card 
                  key={exam.id} 
                  className="hover:shadow-sm transition-all cursor-pointer hover-elevate"
                  onClick={() => setLocation(`/professor/exams/${exam.id}`)}
                >
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{exam.title}</h4>
                      <p className="text-xs text-muted-foreground">
                        {exam.subjectName && `${exam.subjectName} · `}
                        {exam.maxQuestions} questions max · {exam.durationMinutes} min
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={exam.status === "active" ? "default" : "secondary"}>
                        {exam.status === "active" ? "Published" : exam.status || "Draft"}
                      </Badge>
                      {exam.publicExamCode && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-mono font-bold text-primary">{exam.publicExamCode}</span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              navigator.clipboard.writeText(exam.publicExamCode || "");
                              toast({ title: "Copied!", description: "Access code copied." });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
