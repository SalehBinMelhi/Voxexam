import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../hooks/use-auth";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Shield } from "lucide-react";
import { useToast } from "../hooks/use-toast";
import { queryClient } from "../lib/queryClient";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in as admin
  if (user?.role === "admin") {
    setLocation("/dashboard");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Welcome Administrator",
        description: "Successfully logged into the system.",
      });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Authentication Failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-8">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/20 p-4 rounded-full">
            <Shield className="h-10 w-10 text-primary" />
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-center text-white mb-2">System Administration</h1>
        <p className="text-zinc-400 text-center mb-8">
          Restricted access. Authorized personnel only.
        </p>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-300">Admin Email</Label>
            <Input 
              id="email" 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
              placeholder="admin@voxexam.ae"
              required 
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-300">Password</Label>
            <Input 
              id="password" 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-white"
              required 
            />
          </div>

          <Button 
            type="submit" 
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Access System"}
          </Button>
        </form>
      </div>
    </div>
  );
}
