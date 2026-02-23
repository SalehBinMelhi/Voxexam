import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@shared/schema";

interface RoleSelectProps {
  user: User;
}

export default function RoleSelect({ user }: RoleSelectProps) {
  const { toast } = useToast();

  const setRoleMutation = useMutation({
    mutationFn: async (role: string) => {
      const response = await apiRequest("PATCH", `/api/users/${user.id}/role`, { role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to set role. Please try again.",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-primary rounded-md flex items-center justify-center">
              <GraduationCap className="h-8 w-8" style={{ color: "hsl(var(--brand-gold))" }} />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Welcome!</h1>
          <p className="text-muted-foreground">
            Hi {user.firstName || user.email}, choose your role to get started
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">Select Your Role</CardTitle>
            <CardDescription>
              This determines your experience on the platform
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setRoleMutation.mutate("professor")}
                disabled={setRoleMutation.isPending}
                className="p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                data-testid="button-role-professor"
              >
                <Users className="h-10 w-10 text-primary" />
                <span className="font-medium text-lg">Professor</span>
                <span className="text-xs text-muted-foreground text-center">
                  Create exams and manage classes
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRoleMutation.mutate("student")}
                disabled={setRoleMutation.isPending}
                className="p-6 rounded-lg border-2 transition-all flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                data-testid="button-role-student"
              >
                <BookOpen className="h-10 w-10 text-primary" />
                <span className="font-medium text-lg">Student</span>
                <span className="text-xs text-muted-foreground text-center">
                  Take exams and view scores
                </span>
              </button>
            </div>

            {setRoleMutation.isPending && (
              <p className="text-sm text-center text-muted-foreground">Setting up your account...</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
