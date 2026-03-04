import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { PeopleManagementProvider } from "@/components/PeopleManagementContext";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { UndoRedoProvider } from "@/hooks/useUndoRedo";

import Index from "./pages/Index";
import Login from "./pages/Login";

import SetPassword from "./pages/SetPassword";
import AuthCallback from "./pages/AuthCallback";
import NotFound from "./pages/NotFound";
import PlanVyroby from "./pages/PlanVyroby";

const queryClient = new QueryClient();

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

function AppRoutes() {
  const { user, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootAuthRoute />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (profile?.password_set === false) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/set-password" element={<SetPassword />} />
          
          <Route path="*" element={<SetPassword />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <UndoRedoProvider>
      <PeopleManagementProvider>
        <BrowserRouter>
          
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/plan-vyroby" element={<PlanVyroby />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/set-password" element={<SetPassword />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </PeopleManagementProvider>
    </UndoRedoProvider>
  );
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
