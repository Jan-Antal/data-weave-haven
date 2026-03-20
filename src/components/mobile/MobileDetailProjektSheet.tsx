import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { useTPVItems } from "@/hooks/useTPVItems";
import { useSharePointDocs, type SPFile, CATEGORY_FOLDER_MAP } from "@/hooks/useSharePointDocs";
import { ProjectDetailDialog, type ProjectDetailProject } from "@/components/ProjectDetailDialog";
import { ChevronLeft, ChevronRight, FileText, Package, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  project_id: string;
  project_name: string;
  klient?: string | null;
  pm?: string | null;
  status?: string | null;
  prodejni_cena?: number | null;
  currency?: string | null;
  datum_smluvni?: string | null;
  risk?: string | null;
  konstrukter?: string | null;
  kalkulant?: string | null;
  architekt?: string | null;
  narocnost?: string | null;
  location?: string | null;
  pm_poznamka?: string | null;
  tpv_poznamka?: string | null;
  marze?: string | null;
  [key: string]: any;
}

interface MobileDetailProjektSheetProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTPV?: (project: Project) => void;
}

type TabKey = "info" | "tpv" | "docs";

const TABS: { key: TabKey; label: string; icon: typeof Info }[] = [
  { key: "info", label: "Info", icon: Info },
  { key: "tpv", label: "Položky", icon: Package },
  { key: "docs", label: "Dokumenty", icon: FileText },
];

export function MobileDetailProjektSheet({ project, open, onOpenChange, onOpenTPV }: MobileDetailProjektSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const projectId = project?.project_id || "";

  // Reset tab when project changes
  useEffect(() => {
    if (open) setActiveTab("info");
  }, [project?.project_id, open]);

  // Close on mobile nav change
  useEffect(() => {
    const handler = () => onOpenChange(false);
    window.addEventListener("mobile-nav-change", handler);
    return () => window.removeEventListener("mobile-nav-change", handler);
  }, [onOpenChange]);

  // Ref-based swipe-to-dismiss
  const dragRef = useRef({ startY: 0, currentY: 0, dragging: false });
  const sheetRef = useRef<HTMLDivElement>(null);

  function handleDragTouchStart(e: React.TouchEvent) {
    dragRef.current = { startY: e.touches[0].clientY, currentY: e.touches[0].clientY, dragging: true };
  }
  function handleDragTouchMove(e: React.TouchEvent) {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.currentY = e.touches[0].clientY;
    const deltaY = Math.max(0, dragRef.current.currentY - dragRef.current.startY);
    sheetRef.current.style.transition = "none";
    sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    const overlay = sheetRef.current.previousElementSibling as HTMLElement | null;
    if (overlay) {
      overlay.style.transition = "none";
      overlay.style.opacity = String(1 - Math.min(deltaY / 300, 1));
    }
  }
  function handleDragTouchEnd() {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.dragging = false;
    const finalY = dragRef.current.currentY - dragRef.current.startY;
    const el = sheetRef.current;
    const overlay = el.previousElementSibling as HTMLElement | null;
    if (finalY > 80) {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = `translateY(${el.offsetHeight}px)`;
      if (overlay) { overlay.style.transition = "opacity 0.2s ease"; overlay.style.opacity = "0"; }
      setTimeout(() => onOpenChange(false), 200);
    } else {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "translateY(0)";
      if (overlay) { overlay.style.transition = "opacity 0.2s ease"; overlay.style.opacity = "1"; }
    }
  }

  const { data: tpvItems = [] } = useTPVItems(projectId);

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef}
        side="bottom"
        className="h-[85vh] rounded-t-2xl p-0 overflow-hidden flex flex-col"
        style={{ touchAction: "none" }}
        onPointerDownOutside={(e) => { e.preventDefault(); onOpenChange(false); }}
      >
        <SheetTitle className="sr-only">{project.project_name}</SheetTitle>

        {/* Top bar with back button + drag handle */}
        <div
          className="flex items-center justify-between px-4 pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
          onTouchStart={handleDragTouchStart}
          onTouchMove={handleDragTouchMove}
          onTouchEnd={handleDragTouchEnd}
        >
          <button
            onClick={() => onOpenChange(false)}
            className="text-xs font-medium flex items-center gap-1 min-h-[36px]"
            style={{ color: "#6b7280" }}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Zpět
          </button>
          <div className="w-10 h-1 rounded-full" style={{ background: "#d0cdc8" }} />
          <div className="w-[50px]" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 shrink-0" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          <p className="text-[11px] font-mono text-muted-foreground">{project.project_id}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[15px] font-semibold text-foreground truncate min-w-0 flex-1">{project.project_name}</p>
            {project.status && <StatusBadge status={project.status} />}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex shrink-0 px-4 gap-1 pt-2 pb-1" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors min-h-[32px]",
                  isActive
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
                style={isActive ? { backgroundColor: "#223937" } : undefined}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {tab.key === "tpv" && tpvItems.length > 0 && (
                  <span className={cn(
                    "text-[10px] ml-0.5 px-1.5 py-0.5 rounded-full",
                    isActive ? "bg-white/20" : "bg-muted"
                  )}>
                    {tpvItems.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "info" && (
            <ProjectDetailDialog
              project={project as ProjectDetailProject}
              open={true}
              onOpenChange={onOpenChange}
              mode="embedded"
            />
          )}
          {activeTab === "tpv" && (
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
              <TPVTabContent items={tpvItems} currency={project.currency || "CZK"} />
            </div>
          )}
          {activeTab === "docs" && (
            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
              <DocsTabContent projectId={projectId} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}


function TPVTabContent({ items, currency }: { items: any[]; currency: string }) {
  if (items.length === 0) {
    return <p className="text-[12px] text-muted-foreground text-center py-8">Žádné TPV položky</p>;
  }

  return (
    <div className="bg-card rounded-[10px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: idx < items.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-mono text-muted-foreground shrink-0">{item.item_name}</span>
              {item.item_type && (
                <span className="text-[12px] font-medium text-foreground truncate">{item.item_type}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {(item.vyroba_status || item.status) && (
              <StatusBadge status={item.vyroba_status || item.status} />
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  cenova_nabidka: "Cenová nabídka",
  smlouva: "Smlouva",
  zadani: "Zadání",
  vykresy: "Výkresy",
  dokumentace: "Dokumentace",
  dodaci_list: "Dodací list",
  fotky: "Fotky",
};

function DocsTabContent({ projectId }: { projectId: string }) {
  const sp = useSharePointDocs(projectId);
  const { filesByCategory, initialLoading } = sp;
  const [docFilter, setDocFilter] = useState<"all" | "vyroba">("all");

  // Load all categories on mount
  useEffect(() => {
    for (const catKey of Object.keys(CATEGORY_FOLDER_MAP)) {
      sp.listFiles(catKey);
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const allFiles = Object.entries(filesByCategory).flatMap(([cat, files]) =>
    files.map(f => ({ ...f, category: cat }))
  );

  if (allFiles.length === 0) {
    return <p className="text-[12px] text-muted-foreground text-center py-8">Žádné dokumenty</p>;
  }

  // Filter: "vyroba" shows only fotky with "-Log-" in filename
  const filteredCategories = docFilter === "vyroba"
    ? { fotky: (filesByCategory["fotky"] || []).filter((f: SPFile) => f.name.includes("-Log-")) }
    : filesByCategory;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          onClick={() => setDocFilter("all")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
            docFilter === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          Vše
        </button>
        <button
          onClick={() => setDocFilter("vyroba")}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
            docFilter === "vyroba"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          Výroba
        </button>
      </div>
      {Object.entries(filteredCategories).map(([catKey, files]) => {
        if (files.length === 0) return null;
        return (
          <div key={catKey}>
            <h4 className="uppercase text-[11px] font-semibold tracking-wide text-muted-foreground mb-1">
              {CATEGORY_LABELS[catKey] || catKey} ({files.length})
            </h4>
            <div className="bg-card rounded-[10px] overflow-hidden" style={{ border: "0.5px solid hsl(var(--border))" }}>
              {files.map((file: SPFile, idx: number) => (
                <a
                  key={file.itemId || file.name}
                  href={file.downloadUrl || "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors"
                  style={{ borderBottom: idx < files.length - 1 ? "0.5px solid hsl(var(--border))" : undefined }}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-[12px] font-medium text-foreground truncate flex-1">{file.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
