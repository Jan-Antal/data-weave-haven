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

import Index from "./pages/Index";
import Login from "./pages/Login";

import SetPassword from "./pages/SetPassword";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import InviteLanding from "./pages/InviteLanding";
import PlanVyroby from "./pages/PlanVyroby";
import Vyroba from "./pages/Vyroba";
import Analytics from "./pages/Analytics";

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

/** Route guard for admin/owner-only pages and vyroba role */
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, isOwner, isVyroba } = useAuth();
  if (!isAdmin && !isOwner && !isVyroba) return <Navigate to="/" replace />;
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
      <PeopleManagementProvider>
        <BrowserRouter>
          <RealtimeSyncProvider />
          <div style={{ display: 'flex', flexDirection: 'column', height: '100svh', overflow: 'hidden', background: '#f8f7f4' }}>
            <PersistentDesktopHeader />
            <main style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/plan-vyroby" element={<AdminRoute><PlanVyroby /></AdminRoute>} />
                <Route path="/vyroba" element={<AdminRoute><Vyroba /></AdminRoute>} />
                <Route path="/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/set-password" element={<SetPassword />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </PeopleManagementProvider>
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
