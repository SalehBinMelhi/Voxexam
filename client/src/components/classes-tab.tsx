import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  X,
  FileQuestion,
  Mic,
  MessageSquare,
  ListChecks,
  Users,
  Upload,
  FileText,
  Pencil,
  Calendar,
  Clock,
  Trophy,
  User,
  Check,
  Edit2,
  TrendingUp,
  TrendingDown,
  BookOpen,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Layers,
  GraduationCap,
  BarChart3,
} from "lucide-react";
import type { InsertQuestion, QuestionType, Exam, ExamSubmission, Class, ClassMaterial, User as UserType } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { CreateExamDialog } from "@/components/create-exam-dialog";
import { ExamDetailsDialog } from "@/components/exam-details-dialog";
import { TakeExamDialog } from "@/components/take-exam-dialog";
import { StudentDetailPanel } from "@/components/student-detail-panel";
import { Eye } from "lucide-react";

function getExamStatus(exam: Exam): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (!exam.startTime || !exam.endTime) return { label: "Draft", variant: "secondary" };
  const now = new Date();
  const start = parseISO(exam.startTime);
  const end = parseISO(exam.endTime);
  if (isBefore(now, start)) return { label: "Scheduled", variant: "outline" };
  if (isAfter(now, end)) return { label: "Completed", variant: "default" };
  return { label: "Active", variant: "destructive" };
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

export function ClassesTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassStudents, setNewClassStudents] = useState<string[]>([]);
  const [newStudentInput, setNewStudentInput] = useState("");

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [materialsClassId, setMaterialsClassId] = useState<string | null>(null);
  const [createExamOpen, setCreateExamOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);
  const [addStudentInput, setAddStudentInput] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string | null>(null);

  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const { data: exams = [] } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const { data: submissions = [] } = useQuery<ExamSubmission[]>({
    queryKey: ["/api/submissions"],
  });

  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users"],
  });

  const visibleClasses = classes.filter(c => !c.name.startsWith("_simple_"));

  const { data: classMaterialsList = [] } = useQuery<ClassMaterial[]>({
    queryKey: ["/api/classes", materialsClassId || selectedClassId, "materials"],
    queryFn: async () => {
      const cid = materialsClassId || selectedClassId;
      if (!cid) return [];
      const res = await fetch(`/api/classes/${cid}/materials`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(materialsClassId || selectedClassId),
  });

  const { data: classEnrollments = [] } = useQuery<Array<{ id: string; studentId: string; classId: string; student?: UserType }>>({
    queryKey: ["/api/classes", selectedClassId, "enrollments"],
    enabled: !!selectedClassId,
  });

  const createClassMutation = useMutation({
    mutationFn: async ({ name, roster }: { name: string; roster: string[] }) => {
      const res = await apiRequest("POST", "/api/classes", { name, roster });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Class created" });
      setCreateClassOpen(false);
      setNewClassName("");
      setNewClassStudents([]);
    },
  });

  const updateRosterMutation = useMutation({
    mutationFn: async ({ classId, addStudents, removeStudents }: { classId: string; addStudents?: string[]; removeStudents?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/classes/${classId}/roster`, { addStudents, removeStudents });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Student roster updated" });
      setAddStudentInput("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update roster", description: err.message, variant: "destructive" });
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/classes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      if (selectedClassId) setSelectedClassId(null);
      toast({ title: "Class deleted" });
    },
  });

  const uploadMaterialMutation = useMutation({
    mutationFn: async ({ classId, file }: { classId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/classes/${classId}/materials`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", materialsClassId || selectedClassId, "materials"] });
      toast({ title: "Material uploaded" });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/materials/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes", materialsClassId || selectedClassId, "materials"] });
      toast({ title: "Material deleted" });
    },
  });

  const handleFileUpload = (classId: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute("data-class-id", classId);
      fileInputRef.current.click();
    }
  };

  const onFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const classId = e.target.getAttribute("data-class-id");
    if (file && classId) {
      uploadMaterialMutation.mutate({ classId, file });
    }
    e.target.value = "";
  };

  const addNewStudent = () => {
    const name = newStudentInput.trim();
    if (name && !newClassStudents.includes(name)) {
      setNewClassStudents([...newClassStudents, name]);
      setNewStudentInput("");
    }
  };

  const selectedClass = visibleClasses.find(c => c.id === selectedClassId);
  const classExams = exams.filter(e => e.classId === selectedClassId);

  if (selectedClass && selectedStudentId && selectedStudentName) {
    const classSubmissions = submissions.filter(s => classExams.some(e => e.id === s.examId));
    return (
      <StudentDetailPanel
        studentId={selectedStudentId}
        studentName={selectedStudentName}
        exams={classExams}
        submissions={classSubmissions}
        onClose={() => { setSelectedStudentId(null); setSelectedStudentName(null); }}
      />
    );
  }

  if (selectedClass) {
    const classSubmissions = submissions.filter(s => classExams.some(e => e.id === s.examId));

    const studentPerformance: Record<string, { name: string; totalCorrectness: number; totalUnderstanding: number; count: number }> = {};
    for (const sub of classSubmissions) {
      const student = allUsers.find(u => u.id === sub.studentId);
      const name = student
        ? (student.firstName ? `${student.firstName} ${student.lastName || ""}`.trim() : student.email || "Unknown")
        : "Unknown";
      if (!studentPerformance[sub.studentId]) {
        studentPerformance[sub.studentId] = { name, totalCorrectness: 0, totalUnderstanding: 0, count: 0 };
      }
      studentPerformance[sub.studentId].totalCorrectness += sub.totalScore;
      studentPerformance[sub.studentId].totalUnderstanding += (sub.totalUnderstandingScore || 0);
      studentPerformance[sub.studentId].count += 1;
    }

    const performanceList = Object.entries(studentPerformance).map(([id, data]) => ({
      id,
      name: data.name,
      avgCorrectness: data.totalCorrectness / data.count,
      avgUnderstanding: data.totalUnderstanding / data.count,
      examsTaken: data.count,
    })).sort((a, b) => b.avgCorrectness - a.avgCorrectness);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedClassId(null)} data-testid="button-back-to-classes">
            <X className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="flex-1">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              {selectedClass.name}
            </h3>
            <p className="text-sm text-muted-foreground">{classExams.length} exam{classExams.length !== 1 ? "s" : ""} &middot; {(selectedClass.roster?.length || 0) + classEnrollments.length} student{((selectedClass.roster?.length || 0) + classEnrollments.length) !== 1 ? "s" : ""}</p>
          </div>
          <Button onClick={() => setCreateExamOpen(true)} data-testid="button-create-class-exam">
            <Plus className="h-4 w-4 mr-2" />
            Create Exam
          </Button>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(selectedClass.roster?.length || 0) + classEnrollments.length}</p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-chart-2/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-chart-2" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classExams.length}</p>
                  <p className="text-xs text-muted-foreground">Exams</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-chart-3/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-chart-3" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{classMaterialsList.length}</p>
                  <p className="text-xs text-muted-foreground">Materials</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Students
            </h4>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add student by name or email..."
              value={addStudentInput}
              onChange={(e) => setAddStudentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const name = addStudentInput.trim();
                  if (name) {
                    updateRosterMutation.mutate({ classId: selectedClass.id, addStudents: [name] });
                  }
                }
              }}
              data-testid="input-add-student-to-class"
            />
            <Button
              variant="outline"
              onClick={() => {
                const name = addStudentInput.trim();
                if (name) {
                  updateRosterMutation.mutate({ classId: selectedClass.id, addStudents: [name] });
                }
              }}
              disabled={!addStudentInput.trim() || updateRosterMutation.isPending}
              data-testid="button-add-student-to-class"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {(selectedClass.roster && selectedClass.roster.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {selectedClass.roster.map((rosterName) => {
                const matchingUser = allUsers.find(u => {
                  const displayName = u.firstName ? `${u.firstName} ${u.lastName || ""}`.trim() : u.email || "";
                  return displayName === rosterName;
                });
                return (
                  <Badge
                    key={rosterName}
                    variant="default"
                    className="text-xs cursor-pointer hover:bg-primary/80 transition-colors"
                    data-testid={`badge-roster-${rosterName}`}
                    onClick={() => {
                      if (matchingUser) {
                        setSelectedStudentId(matchingUser.id);
                        setSelectedStudentName(rosterName);
                      }
                    }}
                  >
                    <User className="h-3 w-3 mr-1" />
                    {rosterName}
                    <button
                      type="button"
                      className="ml-1 hover:text-destructive transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRosterMutation.mutate({ classId: selectedClass.id, removeStudents: [rosterName] });
                      }}
                      data-testid={`button-remove-roster-${rosterName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}
          {classEnrollments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Enrolled Accounts</p>
              <div className="flex flex-wrap gap-2">
                {classEnrollments.map((enrollment) => {
                  const student = enrollment.student;
                  const name = student
                    ? (student.firstName ? `${student.firstName} ${student.lastName || ""}`.trim() : student.email || "Unknown")
                    : "Unknown";
                  return (
                    <Badge
                      key={enrollment.id}
                      variant="outline"
                      className="text-xs cursor-pointer hover:bg-primary/10 transition-colors"
                      onClick={() => { setSelectedStudentId(enrollment.studentId); setSelectedStudentName(name); }}
                      data-testid={`badge-enrolled-student-${enrollment.id}`}
                    >
                      <User className="h-3 w-3 mr-1" />
                      {name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}
          {(!selectedClass.roster || selectedClass.roster.length === 0) && classEnrollments.length === 0 && (
            <p className="text-sm text-muted-foreground">No students added yet. Type a name above to add students to this class.</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Materials
            </h4>
            <Button variant="outline" size="sm" onClick={() => handleFileUpload(selectedClass.id)} disabled={uploadMaterialMutation.isPending} data-testid="button-class-upload-material">
              <Upload className="h-3.5 w-3.5 mr-1" />
              {uploadMaterialMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </div>
          {classMaterialsList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No materials uploaded. Upload course files for AI grading context and question generation.</p>
          ) : (
            <div className="space-y-2">
              {classMaterialsList.map((material) => (
                <div key={material.id} className="flex items-center justify-between gap-2 p-2 rounded-md border" data-testid={`material-${material.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{material.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {material.createdAt ? format(new Date(material.createdAt), "MMM d, yyyy") : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={() => deleteMaterialMutation.mutate(material.id)}>
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-4">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Exams
          </h4>
          {classExams.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-3">No exams created for this class yet</p>
                <Button onClick={() => setCreateExamOpen(true)} data-testid="button-create-first-class-exam">
                  <Plus className="h-4 w-4 mr-2" /> Create Exam
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {classExams.map((exam) => {
                const status = getExamStatus(exam);
                const examSubs = submissions.filter(s => s.examId === exam.id);
                return (
                  <Card
                    key={exam.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => setSelectedExam(exam)}
                    data-testid={`card-class-exam-${exam.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base line-clamp-1">{exam.title}</CardTitle>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <FileQuestion className="h-3.5 w-3.5" />
                        {exam.questions.length} question{exam.questions.length !== 1 ? "s" : ""}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>{examSubs.length} submission{examSubs.length !== 1 ? "s" : ""}</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={exam.questions.length === 0}
                          onClick={(e) => { e.stopPropagation(); setPreviewExam(exam); }}
                          data-testid={`button-preview-class-exam-${exam.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Preview
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {performanceList.length > 0 && (
          <>
            <Separator />
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Student Performance
              </h4>
              <div className="space-y-2">
                {performanceList.map((student) => (
                  <Card
                    key={student.id}
                    className="cursor-pointer hover-elevate transition-all"
                    onClick={() => { setSelectedStudentId(student.id); setSelectedStudentName(student.name); }}
                    data-testid={`card-student-performance-${student.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-primary underline-offset-2 hover:underline">{student.name}</p>
                            <p className="text-xs text-muted-foreground">{student.examsTaken} exam{student.examsTaken !== 1 ? "s" : ""} taken</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Correctness</p>
                            <p className={`text-sm font-bold ${getScoreColor(student.avgCorrectness)}`}>
                              {(student.avgCorrectness * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Understanding</p>
                            <p className={`text-sm font-bold ${getScoreColor(student.avgUnderstanding)}`}>
                              {(student.avgUnderstanding * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.csv,.json,.docx,.pptx,.xlsx,.xls"
          onChange={onFileSelected}
        />

        <CreateExamDialog open={createExamOpen} onOpenChange={setCreateExamOpen} />
        {selectedExam && (
          <ExamDetailsDialog
            exam={selectedExam}
            open={!!selectedExam}
            onOpenChange={(open) => !open && setSelectedExam(null)}
          />
        )}
        {previewExam && (
          <TakeExamDialog
            exam={previewExam}
            open={!!previewExam}
            onOpenChange={(open) => !open && setPreviewExam(null)}
            previewMode
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">My Classes</h3>
          <p className="text-sm text-muted-foreground">Manage classes, students, materials, and exam performance</p>
        </div>
        <Button onClick={() => setCreateClassOpen(true)} data-testid="button-create-class">
          <Plus className="h-4 w-4 mr-2" />
          Create Class
        </Button>
      </div>

      {visibleClasses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <Layers className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No classes yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create a class to organize students, materials, and exams</p>
            <Button onClick={() => setCreateClassOpen(true)} data-testid="button-create-first-class">
              <Plus className="h-4 w-4 mr-2" /> Create Your First Class
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleClasses.map((cls) => {
            const clsExams = exams.filter(e => e.classId === cls.id);
            const clsSubs = submissions.filter(s => clsExams.some(e => e.id === s.examId));
            const avgScore = clsSubs.length > 0
              ? clsSubs.reduce((sum, s) => sum + s.totalScore, 0) / clsSubs.length
              : null;

            return (
              <Card
                key={cls.id}
                className="cursor-pointer hover-elevate transition-all"
                onClick={() => setSelectedClassId(cls.id)}
                data-testid={`card-class-${cls.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-1">{cls.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); deleteClassMutation.mutate(cls.id); }}
                      data-testid={`button-delete-class-${cls.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <BookOpen className="h-4 w-4" />
                    <span>{clsExams.length} exam{clsExams.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>{clsSubs.length} submission{clsSubs.length !== 1 ? "s" : ""}</span>
                  </div>
                  {avgScore !== null && (
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className={getScoreColor(avgScore)}>Avg: {(avgScore * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={createClassOpen} onOpenChange={setCreateClassOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Class</DialogTitle>
            <DialogDescription>Create a new class and add students</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="class-name">Class Name</Label>
              <Input
                id="class-name"
                placeholder="e.g., CS101 - Intro to Programming"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                data-testid="input-class-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Students (optional)</Label>
              <p className="text-xs text-muted-foreground">Add student names or emails. They can also self-enroll later.</p>
              <div className="flex gap-2">
                <Input
                  placeholder="Student name or email..."
                  value={newStudentInput}
                  onChange={(e) => setNewStudentInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNewStudent(); } }}
                  data-testid="input-class-student"
                />
                <Button variant="outline" onClick={addNewStudent} disabled={!newStudentInput.trim()} data-testid="button-add-class-student">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {newClassStudents.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newClassStudents.map((name) => (
                    <Badge key={name} variant="default" className="cursor-pointer" onClick={() => setNewClassStudents(newClassStudents.filter(n => n !== name))}>
                      <Users className="h-3 w-3 mr-1" />{name}<X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateClassOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createClassMutation.mutate({ name: newClassName, roster: newClassStudents })}
              disabled={!newClassName.trim() || createClassMutation.isPending}
              data-testid="button-submit-class"
            >
              {createClassMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.md,.csv,.json,.docx,.pptx,.xlsx,.xls"
        onChange={onFileSelected}
      />
    </div>
  );
}
