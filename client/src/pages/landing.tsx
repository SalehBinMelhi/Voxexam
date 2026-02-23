import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { GraduationCap, Mic, Brain, Shield, ArrowRight, UserCog, BookOpen } from "lucide-react";

export default function LandingPage() {
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-md flex items-center justify-center">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">VoxExams</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <a href="/api/login">
              <Button variant="outline" data-testid="button-login">Sign In</Button>
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="container mx-auto px-4 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
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
              <div className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">Quick Login</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    size="lg"
                    className="gap-2"
                    onClick={() => handleDemoLogin("professor")}
                    disabled={loggingIn !== null}
                    data-testid="button-login-professor"
                  >
                    <UserCog className="h-4 w-4" />
                    {loggingIn === "professor" ? "Logging in..." : "Login as Professor"}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="gap-2"
                    onClick={() => handleDemoLogin("student")}
                    disabled={loggingIn !== null}
                    data-testid="button-login-student"
                  >
                    <BookOpen className="h-4 w-4" />
                    {loggingIn === "student" ? "Logging in..." : "Login as Student"}
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm text-muted-foreground">
                <span>Free to use</span>
                <span>No credit card required</span>
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
                    <h3 className="font-semibold text-lg">VoxExams Platform</h3>
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
            <Card className="group hover:shadow-md transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Mic className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">Audio Recording</h3>
                <p className="text-sm text-muted-foreground">
                  Students record verbal answers with automatic speech-to-text transcription for accurate grading.
                </p>
              </CardContent>
            </Card>
            <Card className="group hover:shadow-md transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-chart-2/10 rounded-lg flex items-center justify-center group-hover:bg-chart-2/20 transition-colors">
                  <Brain className="h-6 w-6 text-chart-2" />
                </div>
                <h3 className="font-semibold text-lg">AI-Powered Grading</h3>
                <p className="text-sm text-muted-foreground">
                  GPT-4o-mini evaluates answers semantically, providing fair scores with manual override options.
                </p>
              </CardContent>
            </Card>
            <Card className="group hover:shadow-md transition-shadow">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 bg-chart-4/10 rounded-lg flex items-center justify-center group-hover:bg-chart-4/20 transition-colors">
                  <Shield className="h-6 w-6 text-chart-4" />
                </div>
                <h3 className="font-semibold text-lg">University Management</h3>
                <p className="text-sm text-muted-foreground">
                  Organize exams by university and class. Manage students, enrollments, and submissions in one place.
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
    </div>
  );
}
