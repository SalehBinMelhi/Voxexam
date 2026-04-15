import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClerkProvider, SignIn, SignUp, AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import { useAuth } from "@/hooks/use-auth";
import LandingPage from "@/pages/landing";
import RoleSelect from "@/pages/role-select";
import AdminDashboard from "@/pages/admin-dashboard";
import ProfessorDashboard from "@/pages/professor-dashboard";
import StudentDashboard from "@/pages/student-dashboard";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}

function SSOCallbackPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Completing sign in...</p>
      </div>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}

function AppContent() {
  const { user, isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LandingPage />;
  }

  if (!user.role) {
    return <RoleSelect user={user} />;
  }

  if (user.role === "admin") {
    return <AdminDashboard />;
  }

  if (user.role === "professor") {
    return <ProfessorDashboard />;
  }

  return <StudentDashboard />;
}

function Router() {
  return (
    <Switch>
      <Route path="/sign-in/sso-callback" component={SSOCallbackPage} />
      <Route path="/sign-up/sso-callback" component={SSOCallbackPage} />
      <Route path="/sign-in/:rest*" component={SignInPage} />
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-up/:rest*" component={SignUpPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/" component={AppContent} />
      <Route component={AppContent} />
    </Switch>
  );
}

function App() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
