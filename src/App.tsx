import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import SplashScreen from "@/components/SplashScreen";
import { PeopleManagementProvider } from "@/components/PeopleManagementContext";
import { ProductionHeader } from "@/components/production/ProductionHeader";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { UndoRedoProvider } from "@/hooks/useUndoRedo";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { AmiAssistant } from "@/components/AmiAssistant";
import { SimulatedRoleBar } from "@/components/SimulatedRoleBar";

import Index from "./pages/Index";
import Login from "./pages/Login";

import SetPassword from "./pages/SetPassword";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import InviteLanding from "./pages/InviteLanding";
import PlanVyroby from "./pages/PlanVyroby";
import Vyroba from "./pages/Vyroba";
import Analytics from "./pages/Analytics";
import Osoby from "./pages/Osoby";
import Tpv from "./pages/Tpv";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

const BUILD_HASH = typeof __BUILD_HASH__ !== "undefined" ? __BUILD_HASH__ : "dev";
const STORED_HASH_KEY = "ami_build_hash";

// Check if build changed — clear RQ cache if so
const prevHash = localStorage.getItem(STORED_HASH_KEY);
if (prevHash && prevHash !== BUILD_HASH) {
  console.info(`[CacheBust] Build changed ${prevHash} → ${BUILD_HASH}, clearing query cache`);
  queryClient.clear();
}
localStorage.setItem(STORED_HASH_KEY, BUILD_HASH);


function RootAuthRoute() {
  const navigate = useNavigate();

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    const hasAuthParams = Boolean(
      queryParams.get("code") ||
      queryParams.get("token") ||
      queryParams.get("type") ||
      queryParams.get("error") ||
      queryParams.get("error_code") ||
      hashParams.get("access_token") ||
      hashParams.get("refresh_token") ||
      hashParams.get("type") ||
      hashParams.get("error") ||
      hashParams.get("error_code")
    );

    if (hasAuthParams) {
      navigate(`/auth/callback${window.location.search}${window.location.hash}`, { replace: true });
      return;
    }

    navigate("/login", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Načítání...</p>
    </div>
  );
}

/** Portrait lock overlay — shown on mobile landscape */
function PortraitLockOverlay() {
  return (
    <div
      className="portrait-lock-overlay fixed inset-0 z-[9999] bg-primary items-center justify-center text-primary-foreground text-center p-8 hidden"
    >
      <div>
        <p className="text-lg font-semibold mb-2">📱 Otočte telefon</p>
        <p className="text-sm opacity-80">Tato aplikace funguje pouze na výšku.</p>
      </div>
    </div>
  );
}

function PlanRoute({ children }: { children: React.ReactNode }) {
  const { canAccessPlanVyroby } = useAuth();
  if (!canAccessPlanVyroby) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function TpvRoute({ children }: { children: React.ReactNode }) {
  const { canAccessTpv } = useAuth();
  if (!canAccessTpv) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function VyrobaRoute({ children }: { children: React.ReactNode }) {
  const { canManageProduction, canQCOnly, canAccessPlanVyroby } = useAuth();
  if (!canManageProduction && !canQCOnly && !canAccessPlanVyroby) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AnalyticsRoute({ children }: { children: React.ReactNode }) {
  const { canAccessAnalytics } = useAuth();
  if (!canAccessAnalytics) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OsobyRoute({ children }: { children: React.ReactNode }) {
  const { canAccessOsoby } = useAuth();
  if (!canAccessOsoby) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function IndexRoute({ children }: { children: React.ReactNode }) {
  const { canAccessProjectInfo, defaultTab, canAccessPlanVyroby, canManageProduction, canAccessAnalytics, canAccessTpv, canAccessOsoby, canAccessSystem } = useAuth();
  if (!canAccessProjectInfo) {
    // fallback do prvého dostupného modulu
    if (canAccessPlanVyroby) return <Navigate to="/plan-vyroby" replace />;
    if (canManageProduction) return <Navigate to="/vyroba" replace />;
    if (canAccessAnalytics) return <Navigate to="/analytics" replace />;
    if (canAccessTpv) return <Navigate to="/tpv" replace />;
    if (canAccessOsoby) return <Navigate to="/osoby" replace />;
    return <div className="h-screen flex items-center justify-center text-muted-foreground">Nemáš prístup k žiadnemu modulu. Kontaktuj správcu.</div>;
  }
  return <>{children}</>;
}

function PersistentDesktopHeader() {
  const location = useLocation();
  const [headerState, setHeaderState] = useState({ dataLogOpen: false, forecastActive: false });

  const module =
    location.pathname === "/plan-vyroby"
      ? "plan-vyroby"
      : location.pathname === "/vyroba"
        ? "vyroba"
        : location.pathname === "/analytics"
          ? "analytics"
          : location.pathname === "/osoby"
            ? "osoby"
            : location.pathname === "/tpv"
              ? "tpv"
              : location.pathname === "/"
                ? "index"
                : null;

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<Partial<typeof headerState>>;
      setHeaderState((prev) => ({ ...prev, ...customEvent.detail }));
    };

    window.addEventListener("desktop-header-sync", handler as EventListener);
    return () => window.removeEventListener("desktop-header-sync", handler as EventListener);
  }, []);

  useEffect(() => {
    setHeaderState({ dataLogOpen: false, forecastActive: false });
  }, [module]);

  if (!module) return null;

  return (
    <ProductionHeader
      module={module}
      dataLogOpen={headerState.dataLogOpen}
      forecastActive={module === "plan-vyroby" ? headerState.forecastActive : false}
      onToggleDataLog={() => window.dispatchEvent(new CustomEvent("desktop-header-toggle-datalog"))}
      onOpenVyrobaReset={module === "vyroba" ? () => window.dispatchEvent(new CustomEvent("desktop-header-vyroba-reset")) : undefined}
    />
  );
}

function AppRoutes() {
  const { user, loading, profile } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <BrowserRouter>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden' }}>
          <Routes>
            <Route path="/" element={<RootAuthRoute />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="/invite" element={<InviteLanding />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Login />} />
          </Routes>
        </div>
      </BrowserRouter>
    );
  }

  if (profile?.password_set === false) {
    return (
      <BrowserRouter>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden' }}>
          <Routes>
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="*" element={<SetPassword />} />
          </Routes>
        </div>
      </BrowserRouter>
    );
  }

  return (
    <UndoRedoProvider>
      <BrowserRouter>
        <PeopleManagementProvider>
          <RealtimeSyncProvider />
          <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: '#f8f7f4' }}>
            <PersistentDesktopHeader />
            <SimulatedRoleBar />
            <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <Routes>
                <Route path="/" element={<IndexRoute><Index /></IndexRoute>} />
                <Route path="/plan-vyroby" element={<PlanRoute><PlanVyroby /></PlanRoute>} />
                <Route path="/tpv" element={<TpvRoute><Tpv /></TpvRoute>} />
                <Route path="/vyroba" element={<VyrobaRoute><Vyroba /></VyrobaRoute>} />
                <Route path="/analytics" element={<AnalyticsRoute><Analytics /></AnalyticsRoute>} />
                <Route path="/osoby" element={<OsobyRoute><Osoby /></OsobyRoute>} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/set-password" element={<SetPassword />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
            <AmiAssistant />
          </div>
        </PeopleManagementProvider>
      </BrowserRouter>
    </UndoRedoProvider>
  );
}

/** Invisible component that activates global realtime sync */
function RealtimeSyncProvider() {
  useRealtimeSync();
  return null;
}


function VersionCheckBootstrap() {
  useVersionCheck();
  return null;
}

function SplashGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const [minTimePassed, setMinTimePassed] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimePassed(true), 800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) setAuthReady(true);
  }, [loading]);

  const appReady = authReady && minTimePassed;

  return (
    <>
      {!appReady && <SplashScreen />}
      {children}
    </>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <VersionCheckBootstrap />
      <TooltipProvider>
        <AuthProvider>
          <SplashGate>
            <Toaster />
            <Sonner />
            <PortraitLockOverlay />
            <AppRoutes />
          </SplashGate>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
