import { useState, useRef, useMemo, type ReactNode } from "react";
import { Home, Plus, FolderPlus, Camera, StickyNote, ChevronLeft, Search, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logActivity } from "@/lib/activityLog";
import { useQueryClient } from "@tanstack/react-query";

interface MobileBottomNavProps {
  onNewProject: () => void;
  canCreateProject: boolean;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  children?: ReactNode;
}

export function MobileBottomNav({
  onNewProject,
  canCreateProject,
  activeTab = "prehled",
  onTabChange,
  children,
}: MobileBottomNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === "/";
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  // Quick action sub-states
  const [qaMode, setQaMode] = useState<null | "photo" | "note">(null);
  const [qaProjectId, setQaProjectId] = useState("");
  const [qaNote, setQaNote] = useState("");
  const [qaSaving, setQaSaving] = useState(false);
  const [qaSearch, setQaSearch] = useState("");
  const cameraRef = useRef<HTMLInputElement>(null);
  const { data: projects = [] } = useProjects();
  const qc = useQueryClient();

  const isProjectsActive = (activeTab === "prehled" || activeTab === "projekty") && isHome;

  const filteredProjects = useMemo(() => {
    if (!qaSearch.trim()) return projects;
    const q = qaSearch.toLowerCase();
    return projects.filter(p =>
      p.project_id.toLowerCase().includes(q) || p.project_name.toLowerCase().includes(q)
    );
  }, [projects, qaSearch]);

  const selectedProjectName = useMemo(() => {
    if (!qaProjectId) return "";
    const p = projects.find(p => p.project_id === qaProjectId);
    return p ? `${p.project_id} — ${p.project_name}` : qaProjectId;
  }, [qaProjectId, projects]);

  const handleHomeToggle = () => {
    if (isHome) {
      const next = activeTab === "prehled" ? "projekty" : "prehled";
      onTabChange?.(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      navigate("/");
    }
  };

  const resetQA = () => {
    setQaMode(null);
    setQaProjectId("");
    setQaNote("");
    setQaSaving(false);
    setQaSearch("");
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !qaProjectId) return;
    setQaSaving(true);
    try {
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

  const handleSelectProjectForPhoto = (projectId: string) => {
    setQaProjectId(projectId);
    setTimeout(() => cameraRef.current?.click(), 100);
  };

  const ProjectPicker = ({ onSelect }: { onSelect: (id: string) => void }) => (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={qaSearch}
          onChange={(e) => setQaSearch(e.target.value)}
          placeholder="Hledat projekt..."
          className="pl-8 h-10 text-sm"
          autoFocus
        />
        {qaSearch && (
          <button onClick={() => setQaSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="overflow-y-auto max-h-[40vh] -mx-1">
        {filteredProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Žádné výsledky</p>
        ) : (
          filteredProjects.map(p => (
            <button
              key={p.project_id}
              onClick={() => onSelect(p.project_id)}
              className="flex items-center w-full px-3 py-2.5 rounded-lg hover:bg-accent text-sm min-h-[40px] text-left"
            >
              <span className="font-mono text-xs text-muted-foreground mr-2 shrink-0">{p.project_id}</span>
              <span className="truncate">· {p.project_name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border flex items-center justify-around z-50"
        style={{ height: "calc(70px + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Home / Projekty toggle */}
        <button
          onClick={handleHomeToggle}
          className={cn("flex flex-col items-center gap-0.5 min-w-[56px] min-h-[44px] justify-center", isProjectsActive ? "text-primary" : "text-muted-foreground")}
        >
          {activeTab === "prehled" ? (
            <>
              <FolderPlus className="h-5 w-5" />
              <span className="text-[10px]">Projekty</span>
            </>
          ) : (
            <>
              <Home className="h-5 w-5" />
              <span className="text-[10px]">Přehled</span>
            </>
          )}
        </button>

        {/* Center + button */}
        <button
          onClick={() => { resetQA(); setQuickActionOpen(true); }}
          className="flex items-center justify-center -mt-4"
        >
          <div className="h-[52px] w-[52px] rounded-full flex items-center justify-center"
            style={{ backgroundColor: "hsl(var(--primary))", boxShadow: "0 4px 16px hsl(var(--primary) / 0.35)" }}
          >
            <Plus className="h-7 w-7 text-primary-foreground" />
          </div>
        </button>

        {/* AMI Assistant slot — rendered by parent */}
        {children}
      </nav>

      {/* Quick Action Sheet */}
      <Sheet open={quickActionOpen} onOpenChange={(v) => { if (!v) resetQA(); setQuickActionOpen(v); }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-8 pt-3 max-h-[80vh] flex flex-col"
          style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mx-auto mb-4 shrink-0" />

          {/* Main menu */}
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

          {/* Photo mode - project picker */}
          {qaMode === "photo" && !qaProjectId && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <button onClick={() => setQaMode(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-3 shrink-0">
                <ChevronLeft className="h-4 w-4" /> Zpět
              </button>
              <p className="text-sm font-medium mb-2 shrink-0">Vyberte projekt pro foto:</p>
              <ProjectPicker onSelect={handleSelectProjectForPhoto} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            </div>
          )}

          {/* Photo mode - uploading state */}
          {qaMode === "photo" && qaProjectId && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Camera className="h-8 w-8 text-primary animate-pulse" />
              <p className="text-sm text-muted-foreground">
                {qaSaving ? "Nahrávám foto..." : "Čekám na fotku..."}
              </p>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
            </div>
          )}

          {/* Note mode - project picker */}
          {qaMode === "note" && !qaProjectId && (
            <div className="flex-1 overflow-hidden flex flex-col">
              <button onClick={() => setQaMode(null)} className="flex items-center gap-1 text-sm text-muted-foreground mb-3 shrink-0">
                <ChevronLeft className="h-4 w-4" /> Zpět
              </button>
              <p className="text-sm font-medium mb-2 shrink-0">Vyberte projekt pro poznámku:</p>
              <ProjectPicker onSelect={(id) => setQaProjectId(id)} />
            </div>
          )}

          {/* Note mode - text entry */}
          {qaMode === "note" && qaProjectId && (
            <div className="flex-1 flex flex-col">
              <button onClick={() => setQaProjectId("")} className="flex items-center gap-1 text-sm text-muted-foreground mb-3 shrink-0">
                <ChevronLeft className="h-4 w-4" /> Zpět
              </button>
              <p className="text-sm font-medium mb-2 shrink-0">{selectedProjectName}</p>
              <Textarea
                value={qaNote}
                onChange={(e) => setQaNote(e.target.value)}
                placeholder="Vaše poznámka..."
                className="min-h-[100px] flex-1"
                autoFocus
              />
              <Button
                className="w-full mt-3 shrink-0 min-h-[48px]"
                onClick={handleSaveNote}
                disabled={qaSaving || !qaNote.trim()}
              >
                {qaSaving ? "Ukládám..." : "Uložit"}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
