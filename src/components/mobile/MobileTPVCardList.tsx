import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Search, FileText, Plus, Upload, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { useTPVStatusOptions } from "@/hooks/useTPVStatusOptions";
import { getProjectColor } from "@/lib/projectColors";
import type { ProductionStatus } from "@/hooks/useProductionStatuses";

interface TPVItem {
  id: string;
  item_type: string | null;
  nazev_prvku: string | null;
  item_name: string;
  konstrukter: string | null;
  status: string | null;
  pocet: number | null;
  cena: number | null;
  notes: string | null;
  sent_date: string | null;
  accepted_date: string | null;
  custom_fields: any;
}

interface MobileTPVCardListProps {
  items: TPVItem[];
  projectId: string;
  projectName: string;
  currency: string;
  productionStatusMap: Map<string, ProductionStatus[]>;
  onBack: () => void;
  onOpenDetail: () => void;
  onAddItem: (name: string) => void;
  onOpenImport: () => void;
  canManageTPV: boolean;
}

export function MobileTPVCardList({
  items,
  projectId,
  projectName,
  currency,
  productionStatusMap,
  onBack,
  onOpenDetail,
  onAddItem,
  onOpenImport,
  canManageTPV,
}: MobileTPVCardListProps) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const { data: statusOptions = [] } = useTPVStatusOptions();

  const borderColor = getProjectColor(projectId);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return items;
    return items.filter(item => {
      const code = (item.item_name || "").toLowerCase();
      const name = (item.item_type || "").toLowerCase();
      return code.includes(q) || name.includes(q);
    });
  }, [items, search]);

  const handleAddItem = () => {
    const name = newItemName.trim();
    if (name) {
      onAddItem(name);
      setNewItemName("");
    }
    setAddingItem(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-border bg-background">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground min-h-[36px]">
            <ArrowLeft className="h-4 w-4" /> Zpět
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-sm font-semibold text-primary truncate">{projectId}</span>
            <span className="text-sm text-muted-foreground truncate">— {projectName}</span>
          </div>
          <button onClick={onOpenDetail} className="p-1.5 rounded-md hover:bg-accent min-h-[36px] min-w-[36px] flex items-center justify-center">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat položku..."
              className="pl-8 h-8 text-sm"
            />
          </div>
          {canManageTPV && (
            <button onClick={onOpenImport} className="h-8 px-2 rounded-md border border-input bg-background hover:bg-accent text-xs flex items-center gap-1">
              <Upload className="h-3 w-3" /> Import
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto pt-2 bg-background" style={{ padding: "8px 12px 12px 12px" }}>
        <div className="space-y-2">
          {filteredItems.map(item => {
            const statusOpt = statusOptions.find(o => o.label === item.status);
            const statusColor = statusOpt?.color;
            const isExpanded = expandedId === item.id;
            const vyrobaStatuses = productionStatusMap.get(item.item_name || item.item_type || "") || [];
            const vyrobaLabel = vyrobaStatuses[0]?.label || "";

            return (
              <button
                key={item.id}
                className="w-full text-left overflow-hidden transition-colors active:bg-muted/40"
                style={{ borderRadius: 10, border: "0.5px solid #e5e3df", borderLeftWidth: 4, borderLeftColor: borderColor, background: "#ffffff" }}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
              >
                {/* Compact view: 3 fields */}
                <div className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold font-mono text-primary truncate max-w-[160px]" title={item.item_name || "—"}>{item.item_name || "—"}</span>
                    {isExpanded
                      ? <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
                      : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    }
                  </div>
                  {item.item_type && (
                    <p className="text-sm font-semibold text-foreground leading-tight truncate max-w-[200px]" title={item.item_type}>{item.item_type}</p>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {item.status && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-5"
                        style={statusColor ? { backgroundColor: `${statusColor}20`, color: statusColor, borderColor: `${statusColor}50` } : undefined}
                      >
                        {item.status}
                      </Badge>
                    )}
                    {item.konstrukter && (
                      <span className="text-[10px] text-muted-foreground">{item.konstrukter}</span>
                    )}
                    {item.pocet != null && item.pocet > 0 && (
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{item.pocet} ks</span>
                    )}
                    {vyrobaLabel && (
                      <Badge variant="secondary" className="text-[10px] h-5">{vyrobaLabel}</Badge>
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1.5">
                    {item.nazev_prvku && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase">Popis</span>
                        <p className="text-xs text-foreground">{item.nazev_prvku}</p>
                      </div>
                    )}
                    {item.konstrukter && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase">Konstruktér</span>
                        <p className="text-xs text-foreground">{item.konstrukter}</p>
                      </div>
                    )}
                    {item.pocet != null && item.pocet > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase">Počet</span>
                        <p className="text-xs text-foreground">{item.pocet} ks</p>
                      </div>
                    )}
                    {item.cena != null && item.cena > 0 && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase">Cena</span>
                        <p className="text-xs font-semibold text-foreground">{formatCurrency(item.cena, currency)}</p>
                      </div>
                    )}
                    {vyrobaLabel && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase">Výroba</span>
                        <Badge variant="secondary" className="text-[10px] h-5 ml-1">{vyrobaLabel}</Badge>
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Add item */}
        {canManageTPV && (
          <div className="mt-3">
            {addingItem ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={addInputRef}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Název nové položky..."
                  className="h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddItem(); if (e.key === "Escape") setAddingItem(false); }}
                  autoFocus
                />
                <Button size="sm" onClick={handleAddItem} className="shrink-0">Přidat</Button>
              </div>
            ) : (
              <button
                onClick={() => setAddingItem(true)}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm"
              >
                <Plus className="h-4 w-4" />
                Přidat položku
              </button>
            )}
          </div>
        )}

        {filteredItems.length === 0 && !addingItem && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {search ? "Žádné výsledky" : "Žádné položky"}
          </div>
        )}
      </div>
    </div>
  );
}
