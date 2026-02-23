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
import { ClassesTab } from "@/components/classes-tab";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  LogOut,
  GraduationCap,
  Settings,
  FileQuestion,
  Layers,
  Lightbulb,
} from "lucide-react";
import type { University } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function ProfessorDashboard() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("simple");
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary rounded-md flex items-center justify-center">
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-gold))" }} />
            </div>
            <div>
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-purple))" }}>Vox</span>Exams</h1>
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
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" data-testid="button-help">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 text-sm" align="end">
                {activeTab === "simple" ? (
                  <div className="space-y-2">
                    <p className="font-semibold">Quick Exam</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Type an exam title</li>
                      <li>Add questions (short answer, MCQ, or audio)</li>
                      <li>Optionally set start/end dates</li>
                      <li>Type student names to assign them</li>
                      <li>Click "Create Exam" — students can take it right away</li>
                    </ol>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="font-semibold">Classes</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Create a class under your university</li>
                      <li>Upload course materials (PDF, Word, etc.) for AI context</li>
                      <li>Add students to the class roster</li>
                      <li>Create exams — AI can generate questions from your materials</li>
                      <li>View student submissions and scores</li>
                    </ol>
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} data-testid="button-settings">
              <Settings className="h-4 w-4" />
            </Button>
            <ThemeToggle />
            <a href="/api/logout">
              <Button variant="ghost" size="icon" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2" data-testid="tabs-dashboard">
            <TabsTrigger value="simple" className="flex items-center gap-2" data-testid="tab-simple">
              <FileQuestion className="h-4 w-4" />
              Quick Exam
            </TabsTrigger>
            <TabsTrigger value="classes" className="flex items-center gap-2" data-testid="tab-classes">
              <Layers className="h-4 w-4" />
              Classes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="simple">
            <SimpleExamTab />
          </TabsContent>

          <TabsContent value="classes">
            <ClassesTab />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings
            </DialogTitle>
            <DialogDescription>
              Link your university and manage its OpenAI API key
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
                    Link your account to a university so your colleagues can share the same OpenAI API key.
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
                <Label htmlFor="api-key">University OpenAI API Key (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Enter your university's OpenAI API key. All professors linked to this university will use it for AI question generation and grading.
                </p>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={userUniversity?.hasApiKey ? "••••••••••••••••" : "sk-..."}
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
