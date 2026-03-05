import { useState, useRef } from "react";
import { Home, Plus, User, ClipboardList, FolderPlus, Camera, StickyNote, Users, UserCog, DollarSign, Tag, Trash2, BarChart3, Eye, ChevronLeft, Check } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { useQueryClient } from "@tanstack/react-query";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

interface MobileBottomNavProps {
  onNewProject: () => void;
  onSettings: () => void;
  canCreateProject: boolean;
  canAccessSettings: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  // Profile sheet props
  profileName?: string;
  profileEmail?: string;
  profileRole?: string | null;
  realRole?: string | null;
  simulatedRole?: string | null;
  setSimulatedRole?: (r: string | null) => void;
  isOwner?: boolean;
  // Settings callbacks
  canManageUsers?: boolean;
  canManagePeople?: boolean;
  canManageExchangeRates?: boolean;
  canManageStatuses?: boolean;
  canAccessRecycleBin?: boolean;
  isAdmin?: boolean;
  onUserMgmt?: () => void;
  onPeopleMgmt?: () => void;
  onExchangeRates?: () => void;
  onStatusMgmt?: () => void;
  onRecycleBin?: () => void;
  onDataLog?: () => void;
}

export function MobileBottomNav({
  onNewProject,
  canCreateProject,
  activeTab = "project-info",
  onTabChange,
  profileName,
  profileEmail,
  profileRole,
  realRole,
  simulatedRole,
  setSimulatedRole,
  isOwner,
  canManageUsers,
  canManagePeople,
  canManageExchangeRates,
  canManageStatuses,
  canAccessRecycleBin,
  isAdmin,
  onUserMgmt,
  onPeopleMgmt,
  onExchangeRates,
  onStatusMgmt,
  onRecycleBin,
  onDataLog,
}: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  // Quick action sub-states
  const [qaMode, setQaMode] = useState<null | "photo" | "note">(null);
  const [qaProjectId, setQaProjectId] = useState("");
  const [qaNote, setQaNote] = useState("");
  const [qaSaving, setQaSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const { data: projects = [] } = useProjects();
  const qc = useQueryClient();

  const isTPVActive = activeTab === "tpv-status";
  const isProjectsActive = (activeTab === "project-info" || activeTab === "pm-status") && isHome;

  const handleProjects = () => {
    if (isHome) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate("/");
    }
  };

  const handleTPV = () => {
    if (onTabChange) {
      onTabChange("tpv-status");
    }
    if (!isHome) navigate("/");
  };

  const resetQA = () => {
    setQaMode(null);
    setQaProjectId("");
    setQaNote("");
    setQaSaving(false);
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !qaProjectId) return;
    setQaSaving(true);
    try {
      const { useSharePointDocs } = await import("@/hooks/useSharePointDocs");
      // Upload directly via edge function
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const now = new Date();
      const fileName = `foto_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}.jpg`;
      await supabase.functions.invoke("sharepoint-documents", {
        body: { action: "upload", projectId: qaProjectId, category: "Fotky", fileName, fileContent: base64 },
      });
      toast({ title: "Foto nahráno ✓" });
      logActivity({ projectId: qaProjectId, actionType: "document_uploaded", newValue: fileName, detail: "Fotky" });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setQaSaving(false);
      resetQA();
      setQuickActionOpen(false);
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  const handleSaveNote = async () => {
    if (!qaProjectId || !qaNote.trim()) return;
    setQaSaving(true);
    try {
      const proj = projects.find(p => p.project_id === qaProjectId);
      const existing = proj?.pm_poznamka || "";
      const newNote = existing ? `${existing}\n${qaNote.trim()}` : qaNote.trim();
      await supabase.from("projects").update({ pm_poznamka: newNote }).eq("project_id", qaProjectId);
      toast({ title: "Poznámka uložena ✓" });
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setQaSaving(false);
      resetQA();
      setQuickActionOpen(false);
    }
  };

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-background border-t border-border flex items-center justify-around z-50 safe-area-bottom">
        {/* Projekty */}
        <button
          onClick={handleProjects}
          className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", isProjectsActive ? "text-primary" : "text-muted-foreground")}
        >
          <Home className="h-5 w-5" />
          <span className="text-[10px]">Projekty</span>
        </button>

        {/* TPV */}
        <button
          onClick={handleTPV}
          className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", isTPVActive ? "text-primary" : "text-muted-foreground")}
        >
          <ClipboardList className="h-5 w-5" />
          <span className="text-[10px]">TPV</span>
        </button>

        {/* Center + button */}
        <button
          onClick={() => { resetQA(); setQuickActionOpen(true); }}
          className="flex items-center justify-center -mt-3"
        >
          <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center shadow-lg">
            <Plus className="h-6 w-6 text-primary-foreground" />
          </div>
        </button>

        {/* Profil */}
        <button
          onClick={() => setProfileOpen(true)}
          className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", profileOpen ? "text-primary" : "text-muted-foreground")}
        >
          <User className="h-5 w-5" />
          <span className="text-[10px]">Profil</span>
        </button>
      </nav>

      {/* Quick Action Sheet */}
      <Sheet open={quickActionOpen} onOpenChange={(v) => { if (!v) resetQA(); setQuickActionOpen(v); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-3 max-h-[70vh]">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4" />

          {!qaMode && (
            <div className="space-y-2">
              {canCreateProject && (
                <button
                  onClick={() => { setQuickActionOpen(false); onNewProject(); }}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-lg hover:bg-accent text-sm min-h-[48px]"
                >
                  <FolderPlus className="h-5 w-5 text-primary" />
                  <span className="font-medium">Nový projekt</span>
                </button>
              )}
              <button
                onClick={() => setQaMode("photo")}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-lg hover:bg-accent text-sm min-h-[48px]"
              >
                <Camera className="h-5 w-5 text-primary" />
                <span className="font-medium">Foto k projektu</span>
              </button>
              <button
                onClick={() => setQaMode("note")}
                className="flex items-center gap-3 w-full px-4 py-3.5 rounded-lg hover:bg-accent text-sm min-h-[48px]"
              >
                <StickyNote className="h-5 w-5 text-primary" />
                <span className="font-medium">Poznámka</span>
              </button>
            </div>
          )}

          {qaMode === "photo" && (
            <div className="space-y-4">
              <button onClick={() => setQaMode(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <ChevronLeft className="h-4 w-4" /> Zpět
              </button>
              <p className="text-sm font-medium">Vyberte projekt:</p>
              <Select value={qaProjectId} onValueChange={setQaProjectId}>
                <SelectTrigger><SelectValue placeholder="Projekt..." /></SelectTrigger>
                <SelectContent className="z-[99999] max-h-[200px]">
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.project_id} — {p.project_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {qaProjectId && (
                <Button className="w-full" onClick={() => cameraRef.current?.click()} disabled={qaSaving}>
                  <Camera className="h-4 w-4 mr-2" />
                  {qaSaving ? "Nahrávám..." : "Otevřít fotoaparát"}
                </Button>
              )}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            </div>
          )}

          {qaMode === "note" && (
            <div className="space-y-4">
              <button onClick={() => setQaMode(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                <ChevronLeft className="h-4 w-4" /> Zpět
              </button>
              <p className="text-sm font-medium">Vyberte projekt:</p>
              <Select value={qaProjectId} onValueChange={setQaProjectId}>
                <SelectTrigger><SelectValue placeholder="Projekt..." /></SelectTrigger>
                <SelectContent className="z-[99999] max-h-[200px]">
                  {projects.map(p => (
                    <SelectItem key={p.project_id} value={p.project_id}>{p.project_id} — {p.project_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {qaProjectId && (
                <>
                  <Textarea
                    value={qaNote}
                    onChange={(e) => setQaNote(e.target.value)}
                    placeholder="Vaše poznámka..."
                    className="min-h-[80px]"
                  />
                  <Button className="w-full" onClick={handleSaveNote} disabled={qaSaving || !qaNote.trim()}>
                    {qaSaving ? "Ukládám..." : "Uložit poznámku"}
                  </Button>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Profile Sheet */}
      <Sheet open={profileOpen} onOpenChange={setProfileOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-8 pt-3 max-h-[80vh]">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-3" />
          
          {/* Header */}
          <div className="px-4 pb-3 border-b border-border">
            <button onClick={() => setProfileOpen(false)} className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
              <ChevronLeft className="h-4 w-4" /> Zpět
            </button>
            <p className="font-medium text-foreground">{profileName || "Uživatel"}</p>
            {profileEmail && <p className="text-sm text-muted-foreground">{profileEmail}</p>}
            {profileRole && <p className="text-xs text-muted-foreground/60 mt-0.5">{ROLE_LABELS[profileRole] || profileRole}</p>}
          </div>

          {/* Menu items */}
          <div className="overflow-y-auto px-2 pt-2">
            {canManageUsers && (
              <button onClick={() => { setProfileOpen(false); onUserMgmt?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <Users className="h-4 w-4 text-muted-foreground" />
                Správa uživatelů
              </button>
            )}
            {canManagePeople && (
              <button onClick={() => { setProfileOpen(false); onPeopleMgmt?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <UserCog className="h-4 w-4 text-muted-foreground" />
                Správa osob
              </button>
            )}
            {canManageExchangeRates && (
              <button onClick={() => { setProfileOpen(false); onExchangeRates?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                Kurzovní lístek
              </button>
            )}
            {canManageStatuses && (
              <button onClick={() => { setProfileOpen(false); onStatusMgmt?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <Tag className="h-4 w-4 text-muted-foreground" />
                Správa statusů
              </button>
            )}
            {canAccessRecycleBin && (
              <button onClick={() => { setProfileOpen(false); onRecycleBin?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                Koš
              </button>
            )}
            {(isAdmin || profileRole === "pm" || isOwner) && (
              <button onClick={() => { setProfileOpen(false); onDataLog?.(); }} className="flex items-center gap-3 w-full px-4 py-3 rounded-lg hover:bg-accent text-sm min-h-[48px]">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                Data Log
              </button>
            )}

            {/* Role switcher */}
            {realRole === "owner" && setSimulatedRole && (
              <div className="border-t mt-2 pt-2 px-2">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  Zobrazit jako
                </div>
                {(["admin", "pm", "konstrukter", "viewer"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => { setSimulatedRole(r === "admin" ? null : r); setProfileOpen(false); }}
                    className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg hover:bg-accent text-sm min-h-[44px]"
                  >
                    <span>{ROLE_LABELS[r]}</span>
                    {((r === "admin" && !simulatedRole) || simulatedRole === r) && (
                      <Check className="h-4 w-4 text-green-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
