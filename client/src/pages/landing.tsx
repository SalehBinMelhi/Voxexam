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
import { GraduationCap, Mic, Brain, Shield, UserCog, BookOpen, ChevronRight, LogIn, AlertCircle, Users, KeyRound, UserPlus } from "lucide-react";

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
        text: "Once the student finishes recording, the audio is sent for automatic transcription using Google Gemini. The question text is included as context so the AI can better understand subject-specific terminology.",
      },
      {
        heading: "Format Handling",
        text: "Different browsers record audio in different formats (WebM, OGG, etc.). The system handles various formats automatically, so it works reliably across all browsers.",
      },
      {
        heading: "Grading",
        text: "The transcribed text is then sent through the AI grading pipeline — receiving a score from 0 to 10 with detailed feedback. If transcription fails, a word-overlap fallback is used.",
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
        heading: "Intelligent Evaluation",
        text: "Every answer is evaluated by Google Gemini AI, which acts as a fair professor. It compares the student's answer against the expected answer and any uploaded class materials.",
      },
      {
        heading: "Comprehensive Scoring",
        text: "AI evaluates answers semantically, providing scores with detailed feedback including covered key points, missing concepts, and misconceptions.",
      },
      {
        heading: "Class Materials as Context",
        text: "Professors can upload course materials (PDF, Word, PowerPoint, Excel, TXT, etc.) per class. These materials are extracted and passed to the AI when grading, so answers are evaluated against what was actually taught.",
      },
      {
        heading: "MCQ vs. Open-Ended",
        text: "Multiple-choice questions are graded by exact match. Short answer and audio questions go through the full AI evaluation pipeline. Professors can always manually override any score.",
      },
      {
        heading: "Fallback Scoring",
        text: "If the AI is unavailable, the system uses word-overlap scoring as a fallback. Scores are clearly labeled with how they were generated (AI, exact match, fallback, or manual).",
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
        text: "Professors create or join a university, then create classes within it. Each class can have its own set of students, uploaded materials, and exams.",
      },
      {
        heading: "Student Enrollment",
        text: "Students can be added to classes by the professor or can self-enroll using a class code. When creating an exam, professors can assign individual students.",
      },
      {
        heading: "Exam Scheduling",
        text: "Exams can have optional start and end times. If scheduled, students can only take them during the active window. If left unscheduled, the exam is available immediately.",
      },
      {
        heading: "Submissions & Results",
        text: "Professors see all submissions with summary statistics. They can expand each student's submission to see per-question scores, expected vs. actual answers, and AI-generated feedback.",
      },
      {
        heading: "Exam Proctoring",
        text: "Before starting any exam, students must enable their webcam and share their screen. Both are recorded throughout the exam. The system monitors for tab switches and flags suspicious activity.",
      },
    ],
  },
};

export default function LandingPage() {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>(null);

  // Student login state
  const [studentIdInput, setStudentIdInput] = useState("");
  const [examCodeInput, setExamCodeInput] = useState("");
  const [studentLoginError, setStudentLoginError] = useState("");
  const [studentLoginLoading, setStudentLoginLoading] = useState(false);
  const [classStudentName, setClassStudentName] = useState("");
  const [classCodeInput, setClassCodeInput] = useState("");
  const [classLoginError, setClassLoginError] = useState("");
  const [classLoginLoading, setClassLoginLoading] = useState(false);

  // Professor auth state
  const [professorDialogOpen, setProfessorDialogOpen] = useState(false);
  const [professorTab, setProfessorTab] = useState<"signin" | "register">("signin");
  const [profEmail, setProfEmail] = useState("");
  const [profPassword, setProfPassword] = useState("");
  const [profConfirmPassword, setProfConfirmPassword] = useState("");
  const [profFullName, setProfFullName] = useState("");
  const [profError, setProfError] = useState("");
  const [profLoading, setProfLoading] = useState(false);

  // Demo state
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

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
    } catch {
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
    } catch {
      setClassLoginError("Connection error. Please try again.");
    } finally {
      setClassLoginLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setStudentLoginError("");
    setStudentLoginLoading(true);
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role: "student" }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        setStudentLoginError(data.message || "Google Sign-In failed.");
      }
    } catch {
      setStudentLoginError("Google Sign-In error. Please try again.");
    } finally {
      setStudentLoginLoading(false);
    }
  };

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

  const handleProfessorSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfError("");
    if (!profEmail.trim() || !profPassword) {
      setProfError("Email and password are required.");
      return;
    }
    if (!profEmail.trim().toLowerCase().endsWith("@voxexam.ae")) {
      setProfError("Email must end with @voxexam.ae");
      return;
    }
    setProfLoading(true);
    try {
      const res = await fetch("/api/doctor-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: profEmail.trim(), password: profPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        setProfError(data.message || "Sign-in failed.");
      }
    } catch {
      setProfError("Connection error. Please try again.");
    } finally {
      setProfLoading(false);
    }
  };

  const handleProfessorRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfError("");
    if (!profFullName.trim() || !profEmail.trim() || !profPassword || !profConfirmPassword) {
      setProfError("All fields are required.");
      return;
    }
    if (!profEmail.trim().toLowerCase().endsWith("@voxexam.ae")) {
      setProfError("Email must end with @voxexam.ae");
      return;
    }
    if (profPassword !== profConfirmPassword) {
      setProfError("Passwords do not match.");
      return;
    }
    if (profPassword.length < 8) {
      setProfError("Password must be at least 8 characters.");
      return;
    }
    setProfLoading(true);
    try {
      const res = await fetch("/api/professor/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: profFullName.trim(),
          email: profEmail.trim(),
          password: profPassword,
          confirmPassword: profConfirmPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = "/";
      } else {
        setProfError(data.message || "Registration failed.");
      }
    } catch {
      setProfError("Connection error. Please try again.");
    } finally {
      setProfLoading(false);
    }
  };

  const detail = activeFeature ? featureDetails[activeFeature] : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <div>
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams</h1>
              <p className="text-xs text-muted-foreground">Oral Exam Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => { setProfessorDialogOpen(true); setProfError(""); }}
              data-testid="button-professor-login"
            >
              <KeyRound className="h-3.5 w-3.5" />
              Professor Login
            </Button>
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
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-lg">Student Login</h3>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-3 border-2 shadow-sm font-medium bg-background hover:bg-muted mb-4 py-5"
                    onClick={handleGoogleSignIn}
                    disabled={studentLoginLoading}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    Sign in with Google Account
                  </Button>

                  <div className="relative my-4 text-center">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
                    <span className="relative bg-card px-3 text-xs text-muted-foreground uppercase tracking-wider font-semibold">Or enter access code</span>
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
                          <Input id="student-id" placeholder="e.g. John Smith" value={studentIdInput} onChange={(e) => setStudentIdInput(e.target.value)} disabled={studentLoginLoading} data-testid="input-student-id" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="exam-code">Exam Code</Label>
                          <Input id="exam-code" placeholder="Enter 5-digit code or exam ID" value={examCodeInput} onChange={(e) => setExamCodeInput(e.target.value)} disabled={studentLoginLoading} data-testid="input-exam-code" />
                        </div>
                        {studentLoginError && (
                          <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-student-login-error">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>{studentLoginError}</span>
                          </div>
                        )}
                        <Button type="submit" className="w-full gap-2" size="lg" disabled={studentLoginLoading} data-testid="button-student-login">
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
                          <Input id="class-student-name" placeholder="e.g. John Smith" value={classStudentName} onChange={(e) => setClassStudentName(e.target.value)} disabled={classLoginLoading} data-testid="input-class-student-name" />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="class-code">Class Code</Label>
                          <Input id="class-code" placeholder="Enter class join code" value={classCodeInput} onChange={(e) => setClassCodeInput(e.target.value)} disabled={classLoginLoading} data-testid="input-class-code" />
                        </div>
                        {classLoginError && (
                          <div className="flex items-center gap-2 text-sm text-destructive" data-testid="text-class-login-error">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span>{classLoginError}</span>
                          </div>
                        )}
                        <Button type="submit" className="w-full gap-2" size="lg" disabled={classLoginLoading} data-testid="button-class-login">
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
                    data-testid="button-login-professor-demo"
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
                    data-testid="button-login-student-demo"
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
            <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveFeature("audio")} data-testid="card-feature-audio">
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
            <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveFeature("grading")} data-testid="card-feature-grading">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center group-hover:bg-chart-2/20 transition-colors">
                  <Brain className="h-6 w-6 text-chart-2" />
                </div>
                <h3 className="font-semibold text-lg">AI-Powered Grading</h3>
                <p className="text-sm text-muted-foreground">
                  Gemini AI evaluates answers semantically, providing fair scores with manual override options.
                </p>
                <p className="text-xs text-primary font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                  Learn more <ChevronRight className="h-3 w-3" />
                </p>
              </CardContent>
            </Card>
            <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveFeature("management")} data-testid="card-feature-management">
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

      {/* Feature Detail Dialog */}
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

      {/* Professor Sign-In / Register Dialog */}
      <Dialog open={professorDialogOpen} onOpenChange={setProfessorDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <DialogTitle className="text-xl">Professor Portal</DialogTitle>
            </div>
          </DialogHeader>

          <Tabs value={professorTab} onValueChange={(v) => { setProfessorTab(v as "signin" | "register"); setProfError(""); }} className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1 gap-1.5" data-testid="tab-prof-signin">
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1 gap-1.5" data-testid="tab-prof-register">
                <UserPlus className="h-3.5 w-3.5" />
                Create Account
              </TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-4">
              <form onSubmit={handleProfessorSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prof-email-signin">Email</Label>
                  <Input
                    id="prof-email-signin"
                    type="email"
                    placeholder="professor@voxexam.ae"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-email-signin"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prof-password-signin">Password</Label>
                  <Input
                    id="prof-password-signin"
                    type="password"
                    placeholder="Enter your password"
                    value={profPassword}
                    onChange={(e) => setProfPassword(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-password-signin"
                  />
                </div>
                {profError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{profError}</span>
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" size="lg" disabled={profLoading} data-testid="button-prof-signin">
                  <LogIn className="h-4 w-4" />
                  {profLoading ? "Signing in..." : "Sign In"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Only <strong>@voxexam.ae</strong> email addresses are accepted.
                </p>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-4">
              <form onSubmit={handleProfessorRegister} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prof-fullname">Full Name</Label>
                  <Input
                    id="prof-fullname"
                    placeholder="Dr. Ahmed Al Mansouri"
                    value={profFullName}
                    onChange={(e) => setProfFullName(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-fullname"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prof-email-register">Email</Label>
                  <Input
                    id="prof-email-register"
                    type="email"
                    placeholder="professor@voxexam.ae"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-email-register"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prof-password-register">Password</Label>
                  <Input
                    id="prof-password-register"
                    type="password"
                    placeholder="Min 8 chars, uppercase, lowercase, number"
                    value={profPassword}
                    onChange={(e) => setProfPassword(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-password-register"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prof-confirm-password">Confirm Password</Label>
                  <Input
                    id="prof-confirm-password"
                    type="password"
                    placeholder="Re-enter password"
                    value={profConfirmPassword}
                    onChange={(e) => setProfConfirmPassword(e.target.value)}
                    disabled={profLoading}
                    data-testid="input-prof-confirm-password"
                  />
                </div>
                {profError && (
                  <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{profError}</span>
                  </div>
                )}
                <Button type="submit" className="w-full gap-2" size="lg" disabled={profLoading} data-testid="button-prof-register">
                  <UserPlus className="h-4 w-4" />
                  {profLoading ? "Creating Account..." : "Create Professor Account"}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Only <strong>@voxexam.ae</strong> email addresses are accepted.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
