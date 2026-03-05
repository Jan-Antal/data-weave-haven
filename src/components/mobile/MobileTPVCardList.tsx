import { useState, useMemo, useRef } from "react";
import { ArrowLeft, Search, FileText, Plus, Upload, HardHat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

const SORT_OPTIONS = [
  { value: "item_type", label: "Kód" },
  { value: "nazev_prvku", label: "Název" },
  { value: "status", label: "Status" },
  { value: "vyroba", label: "Výroba" },
  { value: "cena", label: "Cena" },
];

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
  const [sortBy, setSortBy] = useState("item_type");
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const { data: statusOptions = [] } = useTPVStatusOptions();

  const borderColor = getProjectColor(projectId);

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    let filtered = items;
    if (q) {
      filtered = items.filter(item => {
        const code = (item.item_type || "").toLowerCase();
        const name = (item.nazev_prvku || item.item_name || "").toLowerCase();
        return code.includes(q) || name.includes(q);
      });
    }
    return [...filtered].sort((a, b) => {
      if (sortBy === "cena") return ((b.cena || 0) - (a.cena || 0));
      if (sortBy === "vyroba") {
        const va = productionStatusMap.get(a.id) || "";
        const vb = productionStatusMap.get(b.id) || "";
        return va.localeCompare(vb, "cs");
      }
      const av = String((a as any)[sortBy] || "");
      const bv = String((b as any)[sortBy] || "");
      return av.localeCompare(bv, "cs");
    });
  }, [items, search, sortBy, productionStatusMap]);

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
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[99999]">
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canManageTPV && (
            <button onClick={onOpenImport} className="h-8 px-2 rounded-md border border-input bg-background hover:bg-accent text-xs flex items-center gap-1">
              <Upload className="h-3 w-3" /> Import
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-3 pt-2 pb-20">
        <div className="space-y-2">
          {filteredItems.map(item => {
            const vyrobaStatus = productionStatusMap.get(item.id) || "";
            const statusOpt = statusOptions.find(o => o.label === item.status);
            const statusColor = statusOpt?.color;

            return (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-card p-3 space-y-1.5"
                style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
              >
                {/* Top row: code + count */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold font-mono text-primary">{item.item_type || "—"}</span>
                  {item.pocet != null && item.pocet > 0 && (
                    <span className="text-xs text-muted-foreground">{item.pocet} ks</span>
                  )}
                </div>

                {/* Název prvku */}
                {item.nazev_prvku && (
                  <p className="text-[15px] font-semibold text-foreground leading-tight">{item.nazev_prvku}</p>
                )}

                {/* Popis */}
                {item.item_name && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.item_name}</p>
                )}

                {/* Konstruktér */}
                {item.konstrukter && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <HardHat className="h-3 w-3" />
                    <span>{item.konstrukter}</span>
                  </div>
                )}

                {/* Status + Výroba badges */}
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
                  {vyrobaStatus && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {vyrobaStatus}
                    </Badge>
                  )}
                </div>

                {/* Cena */}
                {item.cena != null && item.cena > 0 && (
                  <div className="text-right">
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(item.cena, currency)}
                    </span>
                  </div>
                )}
              </div>
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
