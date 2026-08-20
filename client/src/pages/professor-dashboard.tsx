import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SimpleExamTab } from "@/components/simple-exam-tab";
import { AdaptiveExamTab } from "@/components/adaptive-exam-tab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpSupportPopover } from "@/components/help-support-popover";
import {
  LogOut,
  GraduationCap,
  Settings,
  FileQuestion,
  Mic,
  Home,
} from "lucide-react";
import type { University } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function ProfessorDashboard() {
  const { user, logout, logoutUrl } = useAuth();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("create-exam");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [newUniversityName, setNewUniversityName] = useState("");

  const { data: allUniversities = [] } = useQuery<(University & { hasApiKey?: boolean })[]>({
    queryKey: ["/api/universities"],
  });

  const userUniversity = allUniversities.find(u => u.id === user?.universityId);

  const createUniversityMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/universities", { name });
      return res.json();
    },
    onSuccess: async (uni) => {
      await apiRequest("PATCH", `/api/users/${user?.id}/role`, { role: "professor", universityId: uni.id });
      queryClient.invalidateQueries({ queryKey: ["/api/universities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "University created and linked to your account" });
      setNewUniversityName("");
    },
    onError: () => {
      toast({ title: "Failed to create university", variant: "destructive" });
    },
  });

  const linkUniversityMutation = useMutation({
    mutationFn: async (universityId: string) => {
      const res = await apiRequest("PATCH", `/api/users/${user?.id}/role`, { role: "professor", universityId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "University linked to your account" });
    },
  });

  const saveApiKeyMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      if (!user?.universityId) throw new Error("No university linked");
      const res = await apiRequest("PATCH", `/api/universities/${user.universityId}/api-key`, { apiKey: apiKey || null });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      queryClient.invalidateQueries({ queryKey: ["/api/universities"] });
      toast({ title: data.hasApiKey ? "API key saved for your university" : "API key removed" });
      setSettingsOpen(false);
      setApiKeyInput("");
    },
    onError: () => {
      toast({ title: "Failed to save API key", variant: "destructive" });
    },
  });

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user?.email || "Professor";

  const handleGoHome = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    queryClient.setQueryData(["/api/auth/user"], null);
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <div>
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams</h1>
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

            <Button
              variant="outline"
              size="sm"
              onClick={handleGoHome}
              className="gap-1 text-xs"
              title="Return to Home Landing Page"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </Button>

            <HelpSupportPopover role="professor" activeTab={activeTab as "simple" | "classes"} />
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="button-settings">
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <a href={logoutUrl}>
              <Button variant="ghost" size="icon" data-testid="button-logout" title="Exit / Logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:max-w-lg" data-testid="tabs-dashboard">
            <TabsTrigger value="create-exam" className="flex h-auto w-full items-center justify-center gap-2 whitespace-normal px-3 py-2 text-xs sm:text-sm" data-testid="tab-create-exam">
              <FileQuestion className="h-4 w-4" />
              Create Exam
            </TabsTrigger>
            <TabsTrigger value="adaptive-oral" className="flex h-auto w-full items-center justify-center gap-2 whitespace-normal px-3 py-2 text-xs sm:text-sm" data-testid="tab-adaptive-oral">
              <Mic className="h-4 w-4" />
              Create Adaptive Oral Exam
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create-exam">
            <SimpleExamTab />
          </TabsContent>

          <TabsContent value="adaptive-oral">
            <AdaptiveExamTab />
          </TabsContent>
        </Tabs>
      </main>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </DialogTitle>
            <DialogDescription>
              Link your university and manage its AI API key
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-3">
              <Label>University</Label>
              {user?.universityId && userUniversity ? (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-sm" data-testid="badge-university">
                    <GraduationCap className="h-3.5 w-3.5 mr-1" />
                    {userUniversity.name}
                  </Badge>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Link your account to a university so your colleagues can share the same AI API key.
                  </p>
                  {allUniversities.length > 0 && (
                    <div className="space-y-2">
                      <Select onValueChange={(v) => linkUniversityMutation.mutate(v)}>
                        <SelectTrigger data-testid="select-university">
                          <SelectValue placeholder="Select existing university..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allUniversities.map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground text-center">or</p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New university name..."
                      value={newUniversityName}
                      onChange={(e) => setNewUniversityName(e.target.value)}
                      data-testid="input-university-name"
                    />
                    <Button
                      variant="outline"
                      onClick={() => createUniversityMutation.mutate(newUniversityName)}
                      disabled={!newUniversityName.trim() || createUniversityMutation.isPending}
                      data-testid="button-create-university"
                    >
                      Create
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {user?.universityId && (
              <div className="space-y-2">
                <Label htmlFor="api-key">University AI API Key (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Enter your university's AI API key. All professors linked to this university will use it for AI question generation and grading.
                </p>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={userUniversity?.hasApiKey ? "••••••••••••••••" : "Enter API key..."}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  data-testid="input-api-key"
                />
                {userUniversity?.hasApiKey && (
                  <p className="text-xs text-green-600 dark:text-green-400">A custom API key is configured for your university.</p>
                )}
              </div>
            )}
          </div>
          {user?.universityId && (
            <DialogFooter className="flex-col sm:flex-row gap-2">
              {userUniversity?.hasApiKey && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={() => saveApiKeyMutation.mutate("")}
                  disabled={saveApiKeyMutation.isPending}
                  data-testid="button-remove-api-key"
                >
                  Remove Key
                </Button>
              )}
              <Button
                onClick={() => saveApiKeyMutation.mutate(apiKeyInput)}
                disabled={!apiKeyInput.trim() || saveApiKeyMutation.isPending}
                data-testid="button-save-api-key"
              >
                {saveApiKeyMutation.isPending ? "Saving..." : "Save Key"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
