import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "owner" | "admin" | "pm" | "konstrukter" | "viewer";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: { full_name: string; email: string; is_active: boolean } | null;
  role: AppRole | null;
  /** The actual DB role (never changes with simulation) */
  realRole: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  isAdmin: boolean;
  isPM: boolean;
  isKonstrukter: boolean;
  isViewer: boolean;
  canEdit: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canManageTPV: boolean;
  canAccessSettings: boolean;
  canEditColumns: boolean;
  /** Simulated role (null = no simulation, using real role) */
  simulatedRole: AppRole | null;
  setSimulatedRole: (role: AppRole | null) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [realRole, setRealRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulatedRole, setSimulatedRole] = useState<AppRole | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          setTimeout(async () => {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("full_name, email, is_active")
              .eq("id", session.user.id)
              .single();
            setProfile(profileData);

            const { data: roleData } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", session.user.id)
              .single();
            setRealRole((roleData?.role as AppRole) ?? null);
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRealRole(null);
          setSimulatedRole(null);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Effective role: use simulated if set (only owner can simulate)
  const effectiveRole = (simulatedRole && (realRole === "owner")) ? simulatedRole : realRole;

  const isOwner = effectiveRole === "owner";
  const isAdmin = effectiveRole === "admin" || isOwner;
  const isPM = effectiveRole === "pm";
  const isKonstrukter = effectiveRole === "konstrukter";
  const isViewer = effectiveRole === "viewer";

  const value: AuthContextType = {
    user,
    session,
    profile,
    role: effectiveRole,
    realRole,
    loading,
    signIn,
    signOut,
    isOwner,
    isAdmin,
    isPM,
    isKonstrukter,
    isViewer,
    canEdit: !isViewer,
    canCreateProject: isAdmin || isPM,
    canDeleteProject: isAdmin || isPM,
    canManageTPV: isAdmin || isPM || isKonstrukter,
    canAccessSettings: isAdmin,
    canEditColumns: isAdmin,
    simulatedRole,
    setSimulatedRole: (role) => {
      // Only owner can simulate
      if (realRole === "owner") setSimulatedRole(role);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
