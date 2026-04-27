import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { logLoginEvent, resetLoginTracking, hasLoginLoggedInCurrentTab } from "@/hooks/useLoginTracking";
import { startSession, endSession, resetSessionTracking } from "@/hooks/useSessionTracking";
import { resolvePermissions, type Permissions } from "@/lib/permissionPresets";

export type AppRole =
  | "owner"
  | "admin"
  | "vedouci_pm"
  | "pm"
  | "nakupci"
  | "vedouci_konstrukter"
  | "konstrukter"
  | "vedouci_vyroby"
  | "mistr"
  | "quality"
  | "kalkulant"
  | "finance"
  | "viewer"
  | "tester"
  | "vyroba";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: { full_name: string; email: string; is_active: boolean; password_set: boolean } | null;
  role: AppRole | null;
  realRole: AppRole | null;
  loading: boolean;
  linkedPersonName: string | null;
  isTestUser: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  // Legacy role booleans (back-compat)
  isOwner: boolean;
  isAdmin: boolean;
  isPM: boolean;
  isKonstrukter: boolean;
  isViewer: boolean;
  isVyroba: boolean;
  // Permissions
  permissions: Permissions;
  canEdit: boolean;
  canCreateProject: boolean;
  canDeleteProject: boolean;
  canEditProjectCode: boolean;
  canEditSmluvniTermin: boolean;
  canManageTPV: boolean;
  canAccessSettings: boolean;
  canManageUsers: boolean;
  canManagePeople: boolean;
  canManageExternisti: boolean;
  canManageProduction: boolean;
  canAccessAnalytics: boolean;
  canSeePrices: boolean;
  canAccessPlanVyroby: boolean;
  canWritePlanVyroby: boolean;
  canAccessDaylog: boolean;
  canQCOnly: boolean;
  canUploadDocuments: boolean;
  canPermanentDelete: boolean;
  canManageExchangeRates: boolean;
  canManageOverheadProjects: boolean;
  canManageStatuses: boolean;
  canAccessRecycleBin: boolean;
  canAccessTpv: boolean;
  canWriteTpv: boolean;
  // Nové master & sub flagy
  canAccessSystem: boolean;
  canAccessOsoby: boolean;
  canAccessProjectInfo: boolean;
  canAccessExchangeRates: boolean;
  canAccessOverheadProjects: boolean;
  canAccessFormulaBuilder: boolean;
  canAccessZamestnanci: boolean;
  canAccessExternistiTab: boolean;
  canAccessUzivateleTab: boolean;
  canAccessOpravneni: boolean;
  canAccessKatalog: boolean;
  canAccessKapacita: boolean;
  canAccessAnalyticsProjekty: boolean;
  canAccessAnalyticsRezije: boolean;
  canAccessAnalyticsDilna: boolean;
  canAccessAnalyticsVykaz: boolean;
  canViewProjectInfoTab: boolean;
  canWriteProjectInfoTab: boolean;
  canViewPMStatusTab: boolean;
  canWritePMStatusTab: boolean;
  canViewTPVStatusTab: boolean;
  canWriteTPVStatusTab: boolean;
  canViewTPVListTab: boolean;
  canWriteTPVListTab: boolean;
  canViewHarmonogram: boolean;
  canWriteHarmonogram: boolean;
  canAccessForecast: boolean;
  canAccessQC: boolean;
  canWriteDaylog: boolean;
  canWriteQC: boolean;
  canViewTpvPrehlad: boolean;
  canWriteTpvPrehlad: boolean;
  canViewTpvMaterial: boolean;
  canWriteTpvMaterial: boolean;
  canViewTpvHodinovaDotacia: boolean;
  canWriteTpvHodinovaDotacia: boolean;
  canEditColumns: boolean;
  isFieldReadOnly: (field: string, currentValue?: string | null) => boolean;
  defaultTab: string;
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
  const [dbPermissions, setDbPermissions] = useState<Partial<Permissions> | null>(null);
  const [roleDefaults, setRoleDefaults] = useState<Record<string, Partial<Permissions>>>({});
  const [loading, setLoading] = useState(true);
  const [simulatedRole, setSimulatedRole] = useState<AppRole | null>(null);
  const [linkedPersonName, setLinkedPersonName] = useState<string | null>(null);
  const prevUserRef = useRef<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          if (event === "SIGNED_IN" && session.user.id && !hasLoginLoggedInCurrentTab()) {
            void logLoginEvent(session.user.id, session.user.email ?? "");
          }
          startSession(session.user.id, session.user.email ?? "", session.access_token);

          prevUserRef.current = session.user.id;

          setTimeout(async () => {
            const [{ data: profileData }, { data: roleData }, { data: defaultsData }] = await Promise.all([
              supabase
                .from("profiles")
                .select("full_name, email, is_active, person_id, password_set")
                .eq("id", session.user.id)
                .single(),
              supabase
                .from("user_roles")
                .select("role, permissions")
                .eq("user_id", session.user.id)
                .single(),
              supabase
                .from("role_permission_defaults")
                .select("role, permissions"),
            ]);
            setProfile(
              profileData
                ? {
                    full_name: profileData.full_name,
                    email: profileData.email,
                    is_active: profileData.is_active,
                    password_set: profileData.password_set ?? true,
                  }
                : null
            );
            setRealRole((roleData?.role as AppRole) ?? null);
            setDbPermissions(((roleData as any)?.permissions as Partial<Permissions>) ?? null);
            const defaultsMap: Record<string, Partial<Permissions>> = {};
            ((defaultsData ?? []) as any[]).forEach((row) => {
              defaultsMap[row.role] = (row.permissions as Partial<Permissions>) ?? {};
            });
            setRoleDefaults(defaultsMap);

            const personId = (profileData as any)?.person_id;
            if (personId) {
              const { data: personData } = await supabase
                .from("people")
                .select("name")
                .eq("id", personId)
                .single();
              setLinkedPersonName(personData?.name ?? null);
            } else {
              setLinkedPersonName(null);
            }

            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setRealRole(null);
          setDbPermissions(null);
          setRoleDefaults({});
          setSimulatedRole(null);
          setLinkedPersonName(null);
          prevUserRef.current = null;
          resetLoginTracking();
          resetSessionTracking();
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    const handleProfileUpdate = async () => {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s?.user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, email, is_active, person_id, password_set")
          .eq("id", s.user.id)
          .single();
        if (profileData) {
          setProfile({
            full_name: profileData.full_name,
            email: profileData.email,
            is_active: profileData.is_active,
            password_set: profileData.password_set ?? true,
          });
        }
      }
    };
    window.addEventListener("profile-updated", handleProfileUpdate);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("profile-updated", handleProfileUpdate);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await endSession();
    await supabase.auth.signOut();
  };

  // Effective role: only owner can simulate
  const effectiveRole: AppRole | null = (simulatedRole && realRole === "owner") ? simulatedRole : realRole;

  // Resolve permissions in priority: user override > DB role default > static preset.
  // During simulation by owner: ignore the owner's own user override, but still respect DB role defaults
  // so the owner sees the same effective permissions as a real user in that role.
  const isSimulating = !!simulatedRole && realRole === "owner";
  const dbDefaultsForRole = effectiveRole ? roleDefaults[effectiveRole] : null;
  const userOverride = isSimulating ? null : dbPermissions;
  const mergedOverride: Partial<Permissions> = {
    ...(dbDefaultsForRole ?? {}),
    ...(userOverride ?? {}),
  };
  const permissions: Permissions = resolvePermissions(
    effectiveRole,
    Object.keys(mergedOverride).length > 0 ? mergedOverride : null,
  );

  const isTestUser = user?.email === "alfred@ami-test.cz" || effectiveRole === "tester";

  // Legacy role booleans (back-compat)
  const isOwner = effectiveRole === "owner";
  const isAdmin = effectiveRole === "admin" || isOwner;
  const isPM = effectiveRole === "pm" || effectiveRole === "vedouci_pm";
  const isKonstrukter = effectiveRole === "konstrukter" || effectiveRole === "vedouci_konstrukter";
  const isViewer = effectiveRole === "viewer";
  const isVyroba =
    effectiveRole === "vyroba" ||
    effectiveRole === "vedouci_vyroby" ||
    effectiveRole === "mistr";

  // canEditColumns kept for back-compat (only admins/PMs can reorder columns; testers excluded)
  const canEditColumns = (isAdmin || isPM) && !isTestUser;

  const isQCOnlyUser =
    permissions.canQCOnly &&
    permissions.canAccessDaylog &&
    !permissions.canEdit &&
    !permissions.canManageProduction &&
    !permissions.canManageTPV;

  const isFieldReadOnly = (field: string, _currentValue?: string | null): boolean => {
    if (!permissions.canEdit) return true;
    if (isQCOnlyUser) return true;
    if (!permissions.canSeePrices && (field === "prodejni_cena" || field === "marze")) return true;
    if (!permissions.canEditProjectCode && field === "project_id") return true;
    if (!permissions.canEditSmluvniTermin && field === "datum_smluvni") return true;
    return false;
  };

  // defaultTab — first VISIBLE tab inside the Project Info module (`/`).
  // Cross-module routing (e.g. → /vyroba) is handled by IndexRoute in App.tsx,
  // so here we must always return one of the tab values that Index.tsx renders:
  // "project-info" | "pm-status" | "tpv-status" | "plan".
  let defaultTab = "project-info";
  if (permissions.canViewProjectInfoTab) {
    defaultTab = "project-info";
  } else if (permissions.canViewPMStatusTab) {
    defaultTab = "pm-status";
  } else if (permissions.canViewTPVStatusTab) {
    defaultTab = "tpv-status";
  } else if (permissions.canViewHarmonogram) {
    defaultTab = "plan";
  }
  // PM-style roles that can create projects start on PM Status by convention.
  if (permissions.canCreateProject && permissions.canViewPMStatusTab) {
    defaultTab = "pm-status";
  }

  const value: AuthContextType = {
    user,
    session,
    profile,
    role: effectiveRole,
    realRole,
    loading,
    linkedPersonName,
    isTestUser,
    signIn,
    signOut,
    isOwner,
    isAdmin,
    isPM,
    isKonstrukter,
    isViewer,
    isVyroba,
    permissions,
    canEdit: permissions.canEdit,
    canCreateProject: permissions.canCreateProject,
    canDeleteProject: permissions.canDeleteProject,
    canEditProjectCode: permissions.canEditProjectCode,
    canEditSmluvniTermin: permissions.canEditSmluvniTermin,
    canManageTPV: permissions.canManageTPV,
    canAccessSettings: permissions.canAccessSettings,
    canManageUsers: permissions.canManageUsers,
    canManagePeople: permissions.canManagePeople,
    canManageExternisti: permissions.canManageExternisti,
    canManageProduction: permissions.canManageProduction,
    canAccessAnalytics: permissions.canAccessAnalytics,
    canSeePrices: permissions.canSeePrices,
    canAccessPlanVyroby: permissions.canAccessPlanVyroby,
    canWritePlanVyroby: permissions.canWritePlanVyroby,
    canAccessDaylog: permissions.canAccessDaylog,
    canQCOnly: permissions.canQCOnly,
    canUploadDocuments: permissions.canUploadDocuments,
    canPermanentDelete: permissions.canPermanentDelete,
    canManageExchangeRates: permissions.canManageExchangeRates,
    canManageOverheadProjects: permissions.canManageOverheadProjects,
    canManageStatuses: permissions.canManageStatuses,
    canAccessRecycleBin: permissions.canAccessRecycleBin,
    canAccessTpv: permissions.canAccessTpv,
    canWriteTpv: permissions.canWriteTpv,
    canAccessSystem: permissions.canAccessSystem,
    canAccessOsoby: permissions.canAccessOsoby,
    canAccessProjectInfo: permissions.canAccessProjectInfo,
    canAccessExchangeRates: permissions.canAccessExchangeRates,
    canAccessOverheadProjects: permissions.canAccessOverheadProjects,
    canAccessFormulaBuilder: permissions.canAccessFormulaBuilder,
    canAccessZamestnanci: permissions.canAccessZamestnanci,
    canAccessExternistiTab: permissions.canAccessExternistiTab,
    canAccessUzivateleTab: permissions.canAccessUzivateleTab,
    canAccessOpravneni: permissions.canAccessOpravneni,
    canAccessKatalog: permissions.canAccessKatalog,
    canAccessKapacita: permissions.canAccessKapacita,
    canAccessAnalyticsProjekty: permissions.canAccessAnalyticsProjekty,
    canAccessAnalyticsRezije: permissions.canAccessAnalyticsRezije,
    canAccessAnalyticsDilna: permissions.canAccessAnalyticsDilna,
    canAccessAnalyticsVykaz: permissions.canAccessAnalyticsVykaz,
    canViewProjectInfoTab: permissions.canViewProjectInfoTab,
    canWriteProjectInfoTab: permissions.canWriteProjectInfoTab,
    canViewPMStatusTab: permissions.canViewPMStatusTab,
    canWritePMStatusTab: permissions.canWritePMStatusTab,
    canViewTPVStatusTab: permissions.canViewTPVStatusTab,
    canWriteTPVStatusTab: permissions.canWriteTPVStatusTab,
    canViewTPVListTab: permissions.canViewTPVListTab,
    canWriteTPVListTab: permissions.canWriteTPVListTab,
    canViewHarmonogram: permissions.canViewHarmonogram,
    canWriteHarmonogram: permissions.canWriteHarmonogram,
    canAccessForecast: permissions.canAccessForecast,
    canAccessQC: permissions.canAccessQC,
    canWriteDaylog: permissions.canWriteDaylog,
    canWriteQC: permissions.canWriteQC,
    canViewTpvPrehlad: permissions.canViewTpvPrehlad,
    canWriteTpvPrehlad: permissions.canWriteTpvPrehlad,
    canViewTpvMaterial: permissions.canViewTpvMaterial,
    canWriteTpvMaterial: permissions.canWriteTpvMaterial,
    canViewTpvHodinovaDotacia: permissions.canViewTpvHodinovaDotacia,
    canWriteTpvHodinovaDotacia: permissions.canWriteTpvHodinovaDotacia,
    canEditColumns,
    isFieldReadOnly,
    defaultTab,
    simulatedRole,
    setSimulatedRole: (role) => {
      if (realRole === "owner") setSimulatedRole(role);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
