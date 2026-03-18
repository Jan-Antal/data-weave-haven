import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/StatusBadge";
import { useTPVItems } from "@/hooks/useTPVItems";
import { useSharePointDocs, type SPFile, CATEGORY_FOLDER_MAP } from "@/hooks/useSharePointDocs";
import { ProjectDetailDialog, type ProjectDetailProject } from "@/components/ProjectDetailDialog";
import { ChevronRight, FileText, Package, Info, X } from "lucide-react";
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

interface MobileProjectDetailSheetProps {
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

export function MobileProjectDetailSheet({ project, open, onOpenChange, onOpenTPV }: MobileProjectDetailSheetProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("info");
  const projectId = project?.project_id || "";

  // Reset tab when project changes
  useEffect(() => {
    if (open) setActiveTab("info");
  }, [project?.project_id, open]);

  const { data: tpvItems = [] } = useTPVItems(projectId);

  if (!project) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[90vh] rounded-t-2xl p-0 overflow-hidden flex flex-col"
        onPointerDownOutside={(e) => { e.preventDefault(); onOpenChange(false); }}
      >
        <SheetTitle className="sr-only">{project.project_name}</SheetTitle>

        {/* Drag handle */}
        <div
          data-vaul-drag-handle
          className="flex justify-center pt-2 pb-1 shrink-0 cursor-grab active:cursor-grabbing"
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 shrink-0" style={{ borderBottom: "0.5px solid hsl(var(--border))" }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-mono text-muted-foreground">{project.project_id}</p>
              <p className="text-[15px] font-semibold text-foreground truncate">{project.project_name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {project.status && <StatusBadge status={project.status} />}
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-md hover:bg-accent min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
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

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(filesByCategory).map(([catKey, files]) => {
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
