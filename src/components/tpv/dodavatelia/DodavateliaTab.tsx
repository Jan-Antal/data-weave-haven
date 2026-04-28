/**
 * DodavateliaTab — hlavný obsah tabu Dodávatelia.
 *
 * Zobrazuje zoznam dodávateľov (filter podľa kategórie / aktívni-archivovaní),
 * klik na dodávateľa otvorí <SupplierCRMDialog/> s 5 panelmi.
 */

import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Star,
  Loader2,
  Building2,
  Phone,
  Mail,
  Archive,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import type { TpvPermissions, TpvSupplierRow } from "../shared/types";
import { useSupabaseSuppliersList } from "./hooks-list";
import { SupplierCRMDialog } from "./SupplierCRMDialog";
import { AddSupplierDialog } from "./AddSupplierDialog";
import { subcontractPermissionsFromTpv } from "../subdodavky/types";

interface DodavateliaTabProps {
  permissions: TpvPermissions;
}

export function DodavateliaTab({ permissions }: DodavateliaTabProps) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openSupplierId, setOpenSupplierId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const { data: suppliers = [], isLoading } = useSupabaseSuppliersList({
    onlyActive: !showArchived,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      return (
        s.nazov.toLowerCase().includes(q) ||
        s.ico?.toLowerCase().includes(q) ||
        s.kategorie?.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [suppliers, search]);

  // For SupplierCRMDialog we need the subcontract-permissions subset
  const subcontractPerms = useMemo(
    () => subcontractPermissionsFromTpv(permissions),
    [permissions]
  );

  return (
    <div className="space-y-4 p-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hľadať podľa názvu, IČO alebo kategórie…"
            className="pl-8"
          />
        </div>

        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setShowArchived((v) => !v)}
        >
          <Archive className="h-4 w-4 mr-1" />
          {showArchived ? "Vrátane archivovaných" : "Iba aktívni"}
        </Button>

        {permissions.canManageSupplier && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Pridať dodávateľa
          </Button>
        )}
      </div>

      {/* Stats strip */}
      <div className="text-xs text-muted-foreground">
        {isLoading ? (
          "Načítavam…"
        ) : (
          <>
            {filtered.length} z {suppliers.length}{" "}
            {suppliers.length === 1 ? "dodávateľa" : "dodávateľov"}
            {search && ` zodpovedá hľadaniu "${search}"`}
          </>
        )}
      </div>

      {/* Grid of supplier cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Načítavam dodávateľov…
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <Building2 className="h-10 w-10 mx-auto opacity-30 mb-3" />
          <p className="text-sm">
            {suppliers.length === 0
              ? "Žiadni dodávatelia v databáze."
              : "Žiadny dodávateľ nezodpovedá filtru."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <SupplierCard
              key={s.id}
              supplier={s}
              onClick={() => setOpenSupplierId(s.id)}
            />
          ))}
        </div>
      )}

      <SupplierCRMDialog
        supplierId={openSupplierId}
        permissions={subcontractPerms}
        open={openSupplierId !== null}
        onOpenChange={(o) => !o && setOpenSupplierId(null)}
      />

      <AddSupplierDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={(newId) => {
          // Po vytvorení automaticky otvor CRM dialóg pre nového
          // dodávateľa, aby user mohol hneď doplniť kontakty/cenník.
          setOpenSupplierId(newId);
        }}
      />
    </div>
  );
}

// ============================================================
// SUPPLIER CARD
// ============================================================

function SupplierCard({
  supplier,
  onClick,
}: {
  supplier: TpvSupplierRow;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left border rounded-lg p-3 bg-card hover:bg-muted/40 transition-colors group",
        !supplier.is_active && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate">{supplier.nazov}</div>
          {supplier.ico && (
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              IČO {supplier.ico}
            </div>
          )}
        </div>
        {supplier.rating != null && supplier.rating > 0 && (
          <span
            className="text-amber-500 text-xs whitespace-nowrap"
            title={`Rating ${supplier.rating}/5`}
          >
            {Array.from({ length: supplier.rating }).map((_, i) => (
              <Star
                key={i}
                className="h-3 w-3 inline fill-current"
              />
            ))}
          </span>
        )}
      </div>

      {supplier.kategorie && supplier.kategorie.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {supplier.kategorie.slice(0, 3).map((k) => (
            <Badge key={k} variant="outline" className="text-[10px] py-0">
              {k}
            </Badge>
          ))}
          {supplier.kategorie.length > 3 && (
            <span className="text-[10px] text-muted-foreground self-center">
              +{supplier.kategorie.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
        {supplier.kontakt_telefon && (
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" />
            <span className="truncate">{supplier.kontakt_telefon}</span>
          </span>
        )}
        {supplier.kontakt_email && (
          <span className="inline-flex items-center gap-1 truncate">
            <Mail className="h-3 w-3" />
            <span className="truncate">{supplier.kontakt_email}</span>
          </span>
        )}
      </div>

      {!supplier.is_active && (
        <div className="mt-2 text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
          Archivovaný
        </div>
      )}
    </button>
  );
}
