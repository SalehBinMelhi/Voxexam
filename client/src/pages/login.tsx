import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { GraduationCap, Users, BookOpen } from "lucide-react";
import type { User, UserRole } from "@shared/schema";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const { login } = useAuth();

  const loginMutation = useMutation({
    mutationFn: async ({ username, role }: { username: string; role: UserRole }) => {
      const response = await apiRequest("POST", "/api/auth/login", { username, role });
      const user = await response.json();
      return user as User;
    },
    onSuccess: (user) => {
      login(user);
    },
  });

  const handleLogin = () => {
    if (username.trim() && selectedRole) {
      loginMutation.mutate({ username: username.trim(), role: selectedRole });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-8 w-8" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Oral Exam System</h1>
          <p className="text-muted-foreground">
            Welcome to the university oral examination platform
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Enter your username and select your role to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="input-username"
              />
            </div>

            <div className="space-y-3">
              <Label>Select your role</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole("professor")}
                  className={`p-4 rounded-md border-2 transition-all flex flex-col items-center gap-2 hover-elevate ${
                    selectedRole === "professor"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid="button-role-professor"
                >
                  <Users className={`h-8 w-8 ${selectedRole === "professor" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-medium ${selectedRole === "professor" ? "text-primary" : ""}`}>
                    Professor
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    Create and manage exams
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole("student")}
                  className={`p-4 rounded-md border-2 transition-all flex flex-col items-center gap-2 hover-elevate ${
                    selectedRole === "student"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  data-testid="button-role-student"
                >
                  <BookOpen className={`h-8 w-8 ${selectedRole === "student" ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`font-medium ${selectedRole === "student" ? "text-primary" : ""}`}>
                    Student
                  </span>
                  <span className="text-xs text-muted-foreground text-center">
                    Take assigned exams
                  </span>
                </button>
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={!username.trim() || !selectedRole || loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Signing in..." : "Continue"}
            </Button>

            {loginMutation.isError && (
              <p className="text-sm text-destructive text-center">
                Failed to sign in. Please try again.
              </p>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          A simple platform for conducting and managing oral examinations
        </p>
      </div>
    </div>
  );
}
