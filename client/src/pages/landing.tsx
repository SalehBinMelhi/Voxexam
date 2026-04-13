import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GraduationCap, Mic, Brain, Shield, UserCog, BookOpen, ChevronRight, LogIn, AlertCircle, Users } from "lucide-react";
import { useLocation } from "wouter";

type FeatureKey = "audio" | "grading" | "management" | null;

const featureDetails: Record<Exclude<FeatureKey, null>, { title: string; icon: typeof Mic; iconBg: string; iconColor: string; sections: { heading: string; text: string }[] }> = {
  audio: {
    title: "Audio Recording",
    icon: Mic,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    sections: [
      {
        heading: "How It Works",
        text: "When a professor creates an exam with audio-type questions, students see a microphone button. They click to record their verbal answer directly in the browser — no extra software needed.",
      },
      {
        heading: "Speech-to-Text Transcription",
        text: "Once the student finishes recording, the audio is sent to GPT-4o-mini-transcribe for automatic transcription. The question text is included as context so the AI can better understand subject-specific terminology.",
      },
      {
        heading: "Format Handling",
        text: "Different browsers record audio in different formats (WebM, OGG, etc.). The system automatically converts any format to WAV using ffmpeg before transcription, so it works reliably across all browsers.",
      },
      {
        heading: "Grading",
        text: "The transcribed text is then sent through the same AI grading pipeline as written answers — receiving both a correctness score and an understanding score. If transcription fails, a word-overlap fallback is used.",
      },
    ],
  },
  grading: {
    title: "AI-Powered Grading",
    icon: Brain,
    iconBg: "bg-chart-2/10",
    iconColor: "text-chart-2",
    sections: [
      {
        heading: "Dual Scoring System",
        text: "Every answer receives two independent scores: a Correctness Score (are the facts accurate?) and an Understanding Score (does the student truly grasp the concept?). These scores often differ — a student might understand the idea well but state a fact slightly wrong.",
      },
      {
        heading: "How the AI Evaluates",
        text: "GPT-4o-mini acts as a fair professor. It compares the student's answer against the expected answer and any uploaded class materials. For oral/spoken answers, it doesn't penalize informal language, repetition, or filler words.",
      },
      {
        heading: "Class Materials as Context",
        text: "Professors can upload course materials (PDF, Word, PowerPoint, Excel, TXT, etc.) per class. These materials are extracted and passed to the AI when grading, so answers are evaluated against what was actually taught — not just the textbook definition.",
      },
      {
        heading: "MCQ vs. Open-Ended",
        text: "Multiple-choice questions are graded by exact match (correct or incorrect). Short answer and audio questions go through the full AI evaluation pipeline. Professors can always manually override any score.",
      },
      {
        heading: "Fallback Scoring",
        text: "If the AI is unavailable, the system uses word-overlap scoring as a fallback — comparing common words between the student's answer and the expected answer. Scores are clearly labeled with how they were generated (AI, exact match, fallback, or manual).",
      },
    ],
  },
  management: {
    title: "University Management",
    icon: Shield,
    iconBg: "bg-chart-4/10",
    iconColor: "text-chart-4",
    sections: [
      {
        heading: "University & Class Hierarchy",
        text: "Professors create or join a university, then create classes within it. Each class can have its own set of students, uploaded materials, and exams. This keeps everything organized by course.",
      },
      {
        heading: "Student Enrollment",
        text: "Students can be added to classes by the professor (by name or email) or can self-enroll. When creating an exam, professors can assign individual students or bulk-add all enrolled class students with one click.",
      },
      {
        heading: "Exam Scheduling",
        text: "Exams can have optional start and end times. If scheduled, students can only take them during the active window. If left unscheduled, the exam is available immediately and stays open indefinitely.",
      },
      {
        heading: "Submissions & Results",
        text: "Professors see all submissions for their exams with summary statistics (average correctness, average understanding). They can expand each student's submission to see per-question scores, expected vs. actual answers, and AI-generated feedback with strengths, weak points, and study recommendations.",
      },
      {
        heading: "Exam Proctoring",
        text: "Before starting any exam, students must enable their webcam and share their screen. Both are recorded throughout the exam. The system also monitors for tab switches and flags suspicious activity. Professors can review recordings and proctoring alerts per submission.",
      },
    ],
  },
};

export default function LandingPage() {
  const [loggingIn, setLoggingIn] = useState<string | null>(null);
  const [activeFeature, setActiveFeature] = useState<FeatureKey>(null);
  const [studentIdInput, setStudentIdInput] = useState("");
  const [examCodeInput, setExamCodeInput] = useState("");
  const [studentLoginError, setStudentLoginError] = useState("");
  const [studentLoginLoading, setStudentLoginLoading] = useState(false);
  const [classStudentName, setClassStudentName] = useState("");
  const [classCodeInput, setClassCodeInput] = useState("");
  const [classLoginError, setClassLoginError] = useState("");
  const [classLoginLoading, setClassLoginLoading] = useState(false);

  const handleDemoLogin = async (role: "professor" | "student") => {
    setLoggingIn(role);
    try {
      const res = await fetch("/api/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        window.location.href = "/";
      }
    } catch (e) {
      console.error("Demo login failed:", e);
    } finally {
      setLoggingIn(null);
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentLoginError("");
    if (!studentIdInput.trim() || !examCodeInput.trim()) {
      setStudentLoginError("Both fields are required.");
      return;
    }
    setStudentLoginLoading(true);
    try {
      const res = await fetch("/api/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentId: studentIdInput.trim(), examCode: examCodeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        setStudentLoginError(data.message || "Login failed. Please try again.");
      }
    } catch (e) {
      setStudentLoginError("Connection error. Please try again.");
    } finally {
      setStudentLoginLoading(false);
    }
  };

  const handleClassLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassLoginError("");
    if (!classStudentName.trim() || !classCodeInput.trim()) {
      setClassLoginError("Both fields are required.");
      return;
    }
    setClassLoginLoading(true);
    try {
      const res = await fetch("/api/class-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentName: classStudentName.trim(), classCode: classCodeInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        setClassLoginError(data.message || "Login failed. Please try again.");
      }
    } catch (e) {
      setClassLoginError("Connection error. Please try again.");
    } finally {
      setClassLoginLoading(false);
    }
  };

  const detail = activeFeature ? featureDetails[activeFeature] : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <span className="font-semibold text-lg"><span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="/sign-in">
              <Button variant="outline" size="sm" data-testid="button-admin-login">Professor / Admin Login</Button>
            </a>
            <a href="/sign-up">
              <Button size="sm" className="gap-2" data-testid="button-signup">
                <LogIn className="h-4 w-4" />
                Sign Up
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl lg:text-5xl font-serif font-bold tracking-tight leading-tight">
                  University Oral Exams,{" "}
                  <span className="text-primary">Reimagined</span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-md">
                  Create, manage, and grade oral examinations with AI-powered transcription and intelligent scoring. Built for modern universities.
                </p>
              </div>

              <Card className="border-2 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">Student Login</h3>
                  </div>
                  <Tabs defaultValue="join-exam" className="w-full">
                    <TabsList className="w-full" data-testid="tabs-student-login">
                      <TabsTrigger value="join-exam" className="flex-1" data-testid="tab-join-exam">Join Exam</TabsTrigger>
                      <TabsTrigger value="join-class" className="flex-1" data-testid="tab-join-class">Join Class</TabsTrigger>
                    </TabsList>
                    <TabsContent value="join-exam">
                      <p className="text-sm text-muted-foreground mb-4">
                        Enter your name and exam code provided by your professor.
                      </p>
                      <form onSubmit={handleStudentLogin} className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="student-id">Your Name</Label>
                          <Input
                            id="student-id"
                            placeholder="e.g. John Smith"
                            value={studentIdInput}
                            onChange={(e) => setStudentIdInput(e.target.value)}
                            disabled={studentLoginLoading}
                            data-testid="input-student-id"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="exam-code">Exam Code</Label>
                          <Input
                            id="exam-code"
                            placeholder="Enter 5-digit code or exam ID"
                            value={examCodeInput}
                            onChange={(e) => setExamCodeInput(e.target.value)}
                            disabled={studentLoginLoading}
                            data-testid="input-exam-code"
                          />
                        </div>
                        {studentLoginError && (
                          <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-student-login-error">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>{studentLoginError}</span>
                          </div>
                        )}
                        <Button
                          type="submit"
                          className="w-full gap-2"
                          size="lg"
                          disabled={studentLoginLoading}
                          data-testid="button-student-login"
                        >
                          <LogIn className="h-4 w-4" />
                          {studentLoginLoading ? "Logging in..." : "Enter Exam"}
                        </Button>
                      </form>
                    </TabsContent>
                    <TabsContent value="join-class">
                      <p className="text-sm text-muted-foreground mb-4">
                        Enter your name and the class code to join a class.
                      </p>
                      <form onSubmit={handleClassLogin} className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="class-student-name">Your Name</Label>
                          <Input
                            id="class-student-name"
                            placeholder="e.g. John Smith"
                            value={classStudentName}
                            onChange={(e) => setClassStudentName(e.target.value)}
                            disabled={classLoginLoading}
                            data-testid="input-class-student-name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="class-code">Class Code</Label>
                          <Input
                            id="class-code"
                            placeholder="Enter class join code"
                            value={classCodeInput}
                            onChange={(e) => setClassCodeInput(e.target.value)}
                            disabled={classLoginLoading}
                            data-testid="input-class-code"
                          />
                        </div>
                        {classLoginError && (
                          <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-class-login-error">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>{classLoginError}</span>
                          </div>
                        )}
                        <Button
                          type="submit"
                          className="w-full gap-2"
                          size="lg"
                          disabled={classLoginLoading}
                          data-testid="button-class-login"
                        >
                          <Users className="h-4 w-4" />
                          {classLoginLoading ? "Joining..." : "Join Class"}
                        </Button>
                      </form>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Demo Access</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDemoLogin("professor")}
                    disabled={loggingIn !== null}
                    data-testid="button-login-professor"
                  >
                    <UserCog className="h-3.5 w-3.5" />
                    {loggingIn === "professor" ? "Logging in..." : "Demo Professor"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDemoLogin("student")}
                    disabled={loggingIn !== null}
                    data-testid="button-login-student"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    {loggingIn === "student" ? "Logging in..." : "Demo Student"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex items-center justify-center">
              <div className="relative w-full max-w-md aspect-square">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent rounded-3xl" />
                <div className="absolute inset-8 bg-card border rounded-2xl shadow-lg flex flex-col items-center justify-center gap-6 p-8">
                  <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                    <GraduationCap className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="font-semibold text-lg"><span style={{ color: "hsl(var(--brand-blue))" }}>Vox</span>Exams Platform</h3>
                    <p className="text-sm text-muted-foreground">MCQ, Short Answer & Audio Responses</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-3 py-1 bg-primary/10 rounded-full text-xs font-medium text-primary">AI Grading</div>
                    <div className="px-3 py-1 bg-chart-2/10 rounded-full text-xs font-medium text-chart-2">Transcription</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto px-4 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-serif font-bold mb-2">Key Features</h2>
            <p className="text-muted-foreground">Everything you need for modern oral examinations</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <Card
              className="group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveFeature("audio")}
              data-testid="card-feature-audio"
            >
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Audio Recording</h3>
                <p className="text-sm text-muted-foreground">
                  Students record verbal answers with automatic speech-to-text transcription for accurate grading.
                </p>
                <p className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Learn more <ChevronRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
            <Card
              className="group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveFeature("grading")}
              data-testid="card-feature-grading"
            >
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center group-hover:bg-chart-2/20 transition-colors">
                  <Brain className="h-6 w-6 text-chart-2" />
                </div>
                <h3 className="font-semibold text-lg">AI-Powered Grading</h3>
                <p className="text-sm text-muted-foreground">
                  GPT-4o-mini evaluates answers semantically, providing fair scores with manual override options.
                </p>
                <p className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Learn more <ChevronRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
            <Card
              className="group hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setActiveFeature("management")}
              data-testid="card-feature-management"
            >
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center group-hover:bg-chart-4/20 transition-colors">
                  <Shield className="h-6 w-6 text-chart-4" />
                </div>
                <h3 className="font-semibold text-lg">University Management</h3>
                <p className="text-sm text-muted-foreground">
                  Organize exams by university and class. Manage students, enrollments, and submissions in one place.
                </p>
                <p className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Learn more <ChevronRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>VoxExams - Built for university oral examinations</p>
        </div>
      </footer>

      <Dialog open={activeFeature !== null} onOpenChange={(open) => !open && setActiveFeature(null)}>
        {detail && (
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${detail.iconBg} rounded-lg flex items-center justify-center`}>
                  <detail.icon className={`h-5 w-5 ${detail.iconColor}`} />
                </div>
                <DialogTitle className="text-xl">{detail.title}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-5 mt-2">
              {detail.sections.map((section, i) => (
                <div key={i} className="space-y-1.5">
                  <h4 className="font-semibold text-sm">{section.heading}</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{section.text}</p>
                </div>
              ))}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
