import { useState, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { CreateExamDialog } from "@/components/create-exam-dialog";
import { ExamDetailsDialog } from "@/components/exam-details-dialog";
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
  LogOut, 
  Calendar, 
  Users, 
  FileQuestion, 
  Clock,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Layers,
  Trash2,
  Upload,
  FileText,
  X
} from "lucide-react";
import type { Exam, Class, ClassMaterial } from "@shared/schema";
import { format, parseISO, isAfter, isBefore } from "date-fns";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [createClassOpen, setCreateClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [materialsClassId, setMaterialsClassId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: exams = [], isLoading } = useQuery<Exam[]>({
    queryKey: ["/api/exams"],
  });

  const { data: classes = [] } = useQuery<Class[]>({
    queryKey: ["/api/classes"],
  });

  const createClassMutation = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const res = await apiRequest("POST", "/api/classes", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Class created" });
      setCreateClassOpen(false);
      setNewClassName("");
    },
  });

  const deleteClassMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/classes/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/classes"] });
      toast({ title: "Class deleted" });
    },
  });

  const { data: classMaterialsList = [] } = useQuery<ClassMaterial[]>({
    queryKey: ["/api/classes", materialsClassId, "materials"],
    queryFn: async () => {
      if (!materialsClassId) return [];
      const res = await fetch(`/api/classes/${materialsClassId}/materials`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!materialsClassId,
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
      queryClient.invalidateQueries({ queryKey: ["/api/classes", materialsClassId, "materials"] });
      toast({ title: "Material uploaded successfully" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/classes", materialsClassId, "materials"] });
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

  const stats = {
    total: exams.length,
    active: exams.filter((e) => getExamStatus(e).label === "Active").length,
    scheduled: exams.filter((e) => getExamStatus(e).label === "Scheduled").length,
    completed: exams.filter((e) => getExamStatus(e).label === "Completed").length,
  };

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user?.email || "Professor";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-md flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-semibold">VoxExams</h1>
              <p className="text-xs text-muted-foreground">Professor Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {user?.profileImageUrl && (
              <img src={user.profileImageUrl} alt="" className="w-7 h-7 rounded-full" />
            )}
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {displayName}
            </span>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">My Exams</h2>
            <p className="text-muted-foreground">Create and manage your oral examinations</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setCreateClassOpen(true)} data-testid="button-create-class">
              <Layers className="h-4 w-4 mr-2" />
              Add Class
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-exam">
              <Plus className="h-4 w-4 mr-2" />
              Create Exam
            </Button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.txt,.md,.csv,.json,.docx,.pptx,.xlsx,.xls"
          onChange={onFileSelected}
          data-testid="input-file-upload"
        />

        {classes.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              My Classes
            </h3>
            <div className="flex flex-wrap gap-3">
              {classes.map((cls) => {
                const classExams = exams.filter(e => e.classId === cls.id);
                return (
                  <Card key={cls.id} className="w-64" data-testid={`card-class-${cls.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{cls.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">{classExams.length} exams</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setMaterialsClassId(cls.id)}
                            data-testid={`button-materials-${cls.id}`}
                            title="Manage class materials"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteClassMutation.mutate(cls.id)}
                            data-testid={`button-delete-class-${cls.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-exams">{stats.total}</p>
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
        ) : exams.length === 0 ? (
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
            {exams.map((exam) => {
              const status = getExamStatus(exam);
              const cls = classes.find(c => c.id === exam.classId);
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
                      {cls && (
                        <span className="ml-2 text-xs">| {cls.name}</span>
                      )}
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

      <Dialog open={!!materialsClassId} onOpenChange={(open) => !open && setMaterialsClassId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Class Materials
            </DialogTitle>
            <DialogDescription>
              Upload course materials (PDF, Word, PowerPoint, Excel, TXT, MD, CSV) so the AI can use them to better evaluate student answers.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => materialsClassId && handleFileUpload(materialsClassId)}
              disabled={uploadMaterialMutation.isPending}
              data-testid="button-upload-material"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadMaterialMutation.isPending ? "Uploading..." : "Upload File"}
            </Button>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {classMaterialsList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No materials uploaded yet
                </p>
              ) : (
                classMaterialsList.map((material) => (
                  <div
                    key={material.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md border"
                    data-testid={`material-${material.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{material.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {material.createdAt ? format(new Date(material.createdAt), "MMM d, yyyy") : ""}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={() => deleteMaterialMutation.mutate(material.id)}
                      data-testid={`button-delete-material-${material.id}`}
                    >
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createClassOpen} onOpenChange={setCreateClassOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Class</DialogTitle>
            <DialogDescription>Create a new class for your courses</DialogDescription>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateClassOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createClassMutation.mutate({ name: newClassName })}
              disabled={!newClassName.trim() || createClassMutation.isPending}
              data-testid="button-submit-class"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
