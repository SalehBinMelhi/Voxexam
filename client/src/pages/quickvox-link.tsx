import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { GraduationCap, AlertCircle, LogIn, Mic } from "lucide-react";

interface QuickVoxInfo {
  id: string;
  title: string;
  question: string;
}

export default function QuickVoxLinkPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").trim();

  const [info, setInfo] = useState<QuickVoxInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLinkError("");
      try {
        const res = await fetch(`/api/quickvox/${encodeURIComponent(code)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) setLinkError("This link is invalid or has expired.");
          return;
        }
        const data = (await res.json()) as QuickVoxInfo;
        if (!cancelled) setInfo(data);
      } catch {
        if (!cancelled) setLinkError("This link is invalid or has expired.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (code) {
      load();
    } else {
      setLinkError("This link is invalid or has expired.");
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!name.trim()) {
      setSubmitError("Please enter your name.");
      return;
    }
    if (!info) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/student-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentId: name.trim(), examCode: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.message || "Could not start. Please try again.");
        setSubmitting(false);
        return;
      }
      try {
        sessionStorage.setItem("quickvoxAutoOpenExamId", info.id);
      } catch {}
      window.location.href = "/";
    } catch {
      setSubmitError("Connection error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center"
              style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}
            >
              <GraduationCap
                className="h-5 w-5"
                style={{ color: "hsl(var(--brand-logo-fg))" }}
              />
            </div>
            <span className="font-semibold text-lg">
              <span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 lg:py-20 flex justify-center">
        <Card className="w-full max-w-md border-2 border-primary/20">
          <CardContent className="p-6 space-y-5">
            {loading ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : linkError ? (
              <div
                className="flex items-center gap-2 text-sm text-destructive"
                data-testid="text-quickvox-link-error"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{linkError}</span>
              </div>
            ) : info ? (
              <>
                <div className="flex items-center gap-2">
                  <Mic className="h-5 w-5 text-primary" />
                  <h1
                    className="font-semibold text-xl"
                    data-testid="text-quickvox-title"
                  >
                    {info.title}
                  </h1>
                </div>
                <form onSubmit={handleStart} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="quickvox-name">Your Name</Label>
                    <Input
                      id="quickvox-name"
                      placeholder="e.g. John Smith"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={submitting}
                      data-testid="input-quickvox-name"
                    />
                  </div>
                  {submitError && (
                    <div
                      className="flex items-center gap-2 text-sm text-destructive"
                      data-testid="text-quickvox-submit-error"
                    >
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                  <Button
                    type="submit"
                    className="w-full gap-2"
                    size="lg"
                    disabled={submitting}
                    data-testid="button-quickvox-start"
                  >
                    <LogIn className="h-4 w-4" />
                    {submitting ? "Starting..." : "Start"}
                  </Button>
                </form>
              </>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
