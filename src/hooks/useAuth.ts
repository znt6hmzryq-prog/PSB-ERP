import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { getLocalUser, logoutLocal } from "@/lib/localAuth";

export interface AuthUser {
  id: number;
  unionId?: string;
  name: string | null;
  email: string | null;
  phone?: string | null;
  avatar: string | null;
  role: string;
  department?: string;
}

export function useAuth() {
  const [localUser, setLocalUser] = useState<AuthUser | null>(() => {
    const local = getLocalUser();
    return local ? {
      id: local.id,
      unionId: undefined,
      name: local.name,
      email: local.email,
      avatar: local.avatar || null,
      role: local.role,
      department: local.department,
    } : null;
  });

  // Try tRPC auth first, then fall back to localStorage
  const trpcUser = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const user = trpcUser.data || localUser;
  const loading = trpcUser.isLoading;
  console.log(
    "[useAuth]",
    {
      loading,
      trpcUser,
      localUser
    }
  );

  const utils = trpc.useContext();
  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (e) {
      // proceed with local cleanup even if server call fails
      console.warn("logout mutation failed", e);
    }

    try {
      // Invalidate auth.me and clear react-query cache
      await utils.auth.me.invalidate();
      try {
        (utils as any).queryClient?.clear();
      } catch {}
    } catch (e) {
      console.warn("failed to invalidate auth cache", e);
    }

    // Clear local dev auth helpers and storage
    try {
      logoutLocal();
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn("failed to clear storage during logout", e);
    }

    setLocalUser(null);
    // Hard redirect to ensure server cookie is removed and app resets
    window.location.href = "/login";
  };

  return { user, loading, isLoggedIn: !!user, logout };
}
