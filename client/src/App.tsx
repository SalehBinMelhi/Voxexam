import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import LoginPage from "@/pages/login";
import ProfessorDashboard from "@/pages/professor-dashboard";
import StudentDashboard from "@/pages/student-dashboard";

function AuthenticatedApp() {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (user?.role === "professor") {
    return <ProfessorDashboard />;
  }

  return <StudentDashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AuthenticatedApp} />
      <Route component={AuthenticatedApp} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
