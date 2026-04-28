/**
 * Supplier CRM — Cenník pane.
 * Editable price catalog grouped by kategoria.
 */

import { useState, useMemo } from "react";
import { Plus, Edit2, Trash2, Loader2, Save, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  useSupplierPricelist,
  useCreatePricelistItem,
  useUpdatePricelistItem,
  useDeletePricelistItem,
} from "../hooks";
import { formatMoney, formatDateLong } from "../../shared/helpers";
import type {
  TpvSupplierPricelistRow,
  CreateSupplierPricelistInput,
} from "../types";
import type { Mena } from "../../shared/types";
import { MENA } from "../../shared/types";
import type { SubcontractPermissions } from "../../subdodavky/types";

interface PricelistPaneProps {
  supplierId: string;
  permissions: SubcontractPermissions;
}

export function PricelistPane({
  supplierId,
  permissions,
}: PricelistPaneProps) {
  const { data: items = [], isLoading } = useSupplierPricelist(supplierId, true);
  const [editing, setEditing] = useState<TpvSupplierPricelistRow | null>(null);
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, TpvSupplierPricelistRow[]>();
    for (const item of items) {
      const key = item.kategoria ?? "Ostatné";
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Načítavam cenník…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "položka" : "položiek"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cenník sa používa ako referencia pri vytváraní RFQ a pri porovnaní
            ponúk.
          </p>
        </div>
        {permissions.canManageSupplier && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Pridať položku
          </Button>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="border rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Žiadne položky v cenníku.
          </p>
          {permissions.canManageSupplier && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setCreating(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Pridať prvú položku
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([kategoria, rows]) => (
            <div key={kategoria}>
              <h4 className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                {kategoria}
              </h4>
              <div className="border rounded-lg divide-y">
                {rows.map((item) => (
                  <PricelistRow
                    key={item.id}
                    item={item}
                    canEdit={permissions.canManageSupplier}
                    onEdit={() => setEditing(item)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <PricelistFormDialog
          mode="create"
          supplierId={supplierId}
          existingCategories={Array.from(new Set(items.map((i) => i.kategoria).filter((k): k is string => !!k)))}
          onClose={() => setCreating(false)}
        />
      )}

      {editing && (
        <PricelistFormDialog
          mode="edit"
          supplierId={supplierId}
          item={editing}
          existingCategories={Array.from(new Set(items.map((i) => i.kategoria).filter((k): k is string => !!k)))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// PRICELIST ROW
// ============================================================

function PricelistRow({
  item,
  canEdit,
  onEdit,
}: {
  item: TpvSupplierPricelistRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const del = useDeletePricelistItem(item.supplier_id);

  const validUntil = item.platne_do ? new Date(item.platne_do) : null;
  const isExpired = validUntil && validUntil.getTime() < Date.now();

  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_120px_90px_120px_auto] gap-3 px-4 py-2.5 items-center text-sm",
        isExpired && "opacity-60"
      )}
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{item.polozka}</div>
        {item.poznamka && (
          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
            {item.poznamka}
          </div>
        )}
      </div>
      <div className="tabular-nums font-semibold text-right">
        {formatMoney(item.cena, item.mena)} / {item.jednotka}
      </div>
      <div className="text-xs text-muted-foreground">
        {item.leadtime_dni != null ? `${item.leadtime_dni} dní` : "—"}
      </div>
      <div className="text-xs text-muted-foreground">
        {item.platne_do ? (
          <span className={cn(isExpired && "text-red-600 font-medium")}>
            {isExpired ? "Vypršalo " : "Do "}
            {formatDateLong(item.platne_do)}
          </span>
        ) : (
          "Trvalé"
        )}
      </div>
      {canEdit && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              if (confirm(`Odstrániť "${item.polozka}" z cenníka?`)) {
                del.mutate(item.id);
              }
            }}
            disabled={del.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PRICELIST FORM DIALOG
// ============================================================

function PricelistFormDialog({
  mode,
  supplierId,
  item,
  existingCategories,
  onClose,
}: {
  mode: "create" | "edit";
  supplierId: string;
  item?: TpvSupplierPricelistRow;
  existingCategories: string[];
  onClose: () => void;
}) {
  const [polozka, setPolozka] = useState(item?.polozka ?? "");
  const [kategoria, setKategoria] = useState(item?.kategoria ?? "");
  const [cena, setCena] = useState(item?.cena.toString() ?? "");
  const [mena, setMena] = useState<Mena>((item?.mena as Mena) ?? "CZK");
  const [jednotka, setJednotka] = useState(item?.jednotka ?? "ks");
  const [leadtimeDni, setLeadtimeDni] = useState(
    item?.leadtime_dni?.toString() ?? ""
  );
  const [minObjednavka, setMinObjednavka] = useState(
    item?.min_objednavka?.toString() ?? ""
  );
  const [platneOd, setPlatneOd] = useState(item?.platne_od ?? "");
  const [platneDo, setPlatneDo] = useState(item?.platne_do ?? "");
  const [poznamka, setPoznamka] = useState(item?.poznamka ?? "");

  const create = useCreatePricelistItem();
  const update = useUpdatePricelistItem(supplierId);

  const isPending = create.isPending || update.isPending;
  const canSubmit = polozka.trim().length > 0 && cena.trim().length > 0;

  const submit = () => {
    const payload = {
      polozka: polozka.trim(),
      kategoria: kategoria.trim() || undefined,
      cena: Number(cena),
      mena,
      jednotka: jednotka.trim() || "ks",
      leadtime_dni: leadtimeDni ? Number(leadtimeDni) : undefined,
      min_objednavka: minObjednavka ? Number(minObjednavka) : undefined,
      platne_od: platneOd || undefined,
      platne_do: platneDo || undefined,
      poznamka: poznamka.trim() || undefined,
    };

    if (mode === "create") {
      create.mutate(
        { supplier_id: supplierId, ...payload } as CreateSupplierPricelistInput,
        { onSuccess: () => onClose() }
      );
    } else if (item) {
      update.mutate(
        { id: item.id, patch: payload },
        { onSuccess: () => onClose() }
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Pridať položku cenníka" : "Upraviť položku"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>
              Položka <span className="text-red-500">*</span>
            </Label>
            <Input
              value={polozka}
              onChange={(e) => setPolozka(e.target.value)}
              placeholder="RAL 9003 — matná biela"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategória</Label>
            <Input
              value={kategoria}
              onChange={(e) => setKategoria(e.target.value)}
              placeholder="Lakovanie, Sklo, Kovanie…"
              list="kategoria-list"
            />
            <datalist id="kategoria-list">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>
                Cena <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                value={cena}
                onChange={(e) => setCena(e.target.value)}
                placeholder="480"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mena</Label>
              <Select value={mena} onValueChange={(v) => setMena(v as Mena)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MENA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Jednotka</Label>
              <Input
                value={jednotka}
                onChange={(e) => setJednotka(e.target.value)}
                placeholder="ks"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Leadtime (dní)</Label>
              <Input
                type="number"
                value={leadtimeDni}
                onChange={(e) => setLeadtimeDni(e.target.value)}
                placeholder="7"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Min. objednávka</Label>
              <Input
                type="number"
                value={minObjednavka}
                onChange={(e) => setMinObjednavka(e.target.value)}
                placeholder="1500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Platné od</Label>
              <Input
                type="date"
                value={platneOd}
                onChange={(e) => setPlatneOd(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Platné do</Label>
              <Input
                type="date"
                value={platneDo}
                onChange={(e) => setPlatneDo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Poznámka</Label>
            <Input
              value={poznamka}
              onChange={(e) => setPoznamka(e.target.value)}
              placeholder="napr. cena platí pri objednávke nad 5 ks"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            <X className="h-4 w-4 mr-1" />
            Zrušiť
          </Button>
          <Button onClick={submit} disabled={!canSubmit || isPending}>
            <Save className="h-4 w-4 mr-1" />
            {isPending ? "Ukladám…" : mode === "create" ? "Pridať" : "Uložiť"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
