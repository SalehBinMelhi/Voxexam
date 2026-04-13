import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser, useClerk } from "@clerk/clerk-react";
import type { User } from "@shared/models/auth";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();
  const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
  const { signOut } = useClerk();

  const { data: dbUser, isLoading: dbLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
    enabled: clerkLoaded,
  });

  const isLoading = !clerkLoaded || dbLoading;
  const user = dbUser;
  const isAuthenticated = !!user;

  const isLocalOrDemo = user?.id?.startsWith("local-") || user?.id?.startsWith("demo-");

  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (isLocalOrDemo) {
        window.location.href = "/api/demo-logout";
      } else {
        await signOut();
        queryClient.setQueryData(["/api/auth/user"], null);
        window.location.href = "/";
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
