/**
 * Supplier CRM — Prehľad pane.
 * KPIs (computed) + základné údaje + obchodné podmienky + interná poznámka.
 */

import { useState, useMemo } from "react";
import { Edit2, Save, X, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  useSupplier,
  useUpdateSupplier,
  useSupplierSubcontracts,
} from "../hooks";
import { computeSupplierStats } from "../api";
import { formatMoneyCompact, formatDateLong } from "../../shared/helpers";
import type { SubcontractPermissions } from "../../subdodavky/types";
import type { TpvSupplierRow } from "../../shared/types";

interface OverviewPaneProps {
  supplierId: string;
  permissions: SubcontractPermissions;
}

export function OverviewPane({ supplierId, permissions }: OverviewPaneProps) {
  const { data: supplier, isLoading } = useSupplier(supplierId);
  const { data: subcontracts = [] } = useSupplierSubcontracts(supplierId);

  const stats = useMemo(
    () => computeSupplierStats(subcontracts),
    [subcontracts]
  );

  if (isLoading || !supplier) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Načítavam dodávateľa…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="Aktívne zákazky"
          value={stats.active_subcontracts.toString()}
          sub={`${formatMoneyCompact(stats.active_value)} Kč v práci`}
        />
        <KpiCard
          label="On-time rate"
          value={
            stats.on_time_rate != null
              ? `${Math.round(stats.on_time_rate * 100)}%`
              : "—"
          }
          sub={
            stats.on_time_sample > 0
              ? `vzorka ${stats.on_time_sample}`
              : "žiadne dodané"
          }
          tone={
            stats.on_time_rate == null
              ? "neutral"
              : stats.on_time_rate >= 0.9
              ? "good"
              : stats.on_time_rate >= 0.75
              ? "warn"
              : "bad"
          }
        />
        <KpiCard
          label="Leadtime ⌀"
          value={
            stats.avg_leadtime_days != null
              ? `${Math.round(stats.avg_leadtime_days)} dní`
              : "—"
          }
          sub={
            stats.delivered_count > 0
              ? `z ${stats.delivered_count} ${
                  stats.delivered_count === 1 ? "dodávky" : "dodávok"
                }`
              : "žiadne dáta"
          }
        />
        <KpiCard
          label="Obrat YTD"
          value={`${formatMoneyCompact(stats.total_value_ytd)} Kč`}
          sub={
            stats.cooperation_since
              ? `od ${new Date(stats.cooperation_since).getFullYear()}`
              : ""
          }
        />
      </div>

      {/* 2-column layout */}
      <div className="grid md:grid-cols-2 gap-4">
        <BasicInfoBox
          supplier={supplier}
          canEdit={permissions.canManageSupplier}
        />
        <BusinessTermsBox
          supplier={supplier}
          canEdit={permissions.canManageSupplier}
        />
      </div>

      <InternalNotesBox
        supplier={supplier}
        canEdit={permissions.canManageSupplier}
      />
    </div>
  );
}

// ============================================================
// KPI CARD
// ============================================================

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-foreground",
    good: "text-green-600",
    warn: "text-amber-600",
    bad: "text-red-600",
  }[tone];

  return (
    <div className="border rounded-lg px-3 py-2.5 bg-muted/20">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={cn("text-xl font-bold tabular-nums mt-1", toneClass)}>
        {value}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {sub}
        </div>
      )}
    </div>
  );
}

// ============================================================
// BASIC INFO BOX (editable)
// ============================================================

function BasicInfoBox({
  supplier,
  canEdit,
}: {
  supplier: TpvSupplierRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    nazov: supplier.nazov,
    ico: supplier.ico ?? "",
    dic: supplier.dic ?? "",
    adresa: supplier.adresa ?? "",
    web: supplier.web ?? "",
  });
  const update = useUpdateSupplier();

  const save = () => {
    update.mutate(
      {
        id: supplier.id,
        patch: {
          nazov: draft.nazov,
          ico: draft.ico || null,
          dic: draft.dic || null,
          adresa: draft.adresa || null,
          web: draft.web || null,
        } as any,
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <InfoBox
      title="Základné údaje"
      canEdit={canEdit}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setDraft({
          nazov: supplier.nazov,
          ico: supplier.ico ?? "",
          dic: supplier.dic ?? "",
          adresa: supplier.adresa ?? "",
          web: supplier.web ?? "",
        });
      }}
      onSave={save}
      isSaving={update.isPending}
    >
      {editing ? (
        <div className="space-y-2.5">
          <FieldEdit label="Názov">
            <Input
              value={draft.nazov}
              onChange={(e) => setDraft({ ...draft, nazov: e.target.value })}
            />
          </FieldEdit>
          <FieldEdit label="IČO">
            <Input
              value={draft.ico}
              onChange={(e) => setDraft({ ...draft, ico: e.target.value })}
            />
          </FieldEdit>
          <FieldEdit label="DIČ">
            <Input
              value={draft.dic}
              onChange={(e) => setDraft({ ...draft, dic: e.target.value })}
            />
          </FieldEdit>
          <FieldEdit label="Adresa">
            <Input
              value={draft.adresa}
              onChange={(e) => setDraft({ ...draft, adresa: e.target.value })}
            />
          </FieldEdit>
          <FieldEdit label="Web">
            <Input
              value={draft.web}
              onChange={(e) => setDraft({ ...draft, web: e.target.value })}
              placeholder="https://…"
            />
          </FieldEdit>
        </div>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <Row k="Názov" v={supplier.nazov} />
          <Row k="IČO" v={supplier.ico} />
          <Row k="DIČ" v={supplier.dic} />
          <Row k="Adresa" v={supplier.adresa} />
          {supplier.web && (
            <div className="grid grid-cols-[110px_1fr] gap-2 py-1">
              <dt className="text-muted-foreground">Web</dt>
              <dd>
                <a
                  href={
                    supplier.web.startsWith("http")
                      ? supplier.web
                      : `https://${supplier.web}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {supplier.web} ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
      )}
    </InfoBox>
  );
}

// ============================================================
// BUSINESS TERMS BOX (read-only summary, editable rating + categories)
// ============================================================

function BusinessTermsBox({
  supplier,
  canEdit,
}: {
  supplier: TpvSupplierRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(supplier.rating ?? 0);
  const [kategorie, setKategorie] = useState(
    (supplier.kategorie ?? []).join(", ")
  );

  const update = useUpdateSupplier();

  const save = () => {
    update.mutate(
      {
        id: supplier.id,
        patch: {
          rating: rating || null,
          kategorie: kategorie
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        } as any,
      },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <InfoBox
      title="Hodnotenie a kategórie"
      canEdit={canEdit}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setRating(supplier.rating ?? 0);
        setKategorie((supplier.kategorie ?? []).join(", "));
      }}
      onSave={save}
      isSaving={update.isPending}
    >
      {editing ? (
        <div className="space-y-2.5">
          <FieldEdit label="Rating">
            <div className="flex gap-1 items-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className={cn(
                    "text-xl",
                    n <= rating ? "text-amber-500" : "text-muted-foreground/40"
                  )}
                >
                  ★
                </button>
              ))}
              <span className="text-xs text-muted-foreground ml-2">
                {rating > 0 ? `${rating}/5` : "—"}
              </span>
            </div>
          </FieldEdit>
          <FieldEdit label="Kategórie">
            <Input
              value={kategorie}
              onChange={(e) => setKategorie(e.target.value)}
              placeholder="Lakovanie, Sklo, …"
            />
          </FieldEdit>
        </div>
      ) : (
        <dl className="space-y-1.5 text-sm">
          <div className="grid grid-cols-[110px_1fr] gap-2 py-1">
            <dt className="text-muted-foreground">Rating</dt>
            <dd>
              {supplier.rating ? (
                <span className="text-amber-500">
                  {"★".repeat(supplier.rating)}
                  <span className="text-muted-foreground/40">
                    {"★".repeat(5 - supplier.rating)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground ml-1">
                    {supplier.rating}/5
                  </span>
                </span>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-2 py-1">
            <dt className="text-muted-foreground">Kategórie</dt>
            <dd>
              {supplier.kategorie?.length ? (
                <div className="flex flex-wrap gap-1">
                  {supplier.kategorie.map((k) => (
                    <span
                      key={k}
                      className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <Row
            k="Spolupráca od"
            v={
              supplier.created_at
                ? formatDateLong(supplier.created_at)
                : null
            }
          />
        </dl>
      )}
    </InfoBox>
  );
}

// ============================================================
// INTERNAL NOTES (editable)
// ============================================================

function InternalNotesBox({
  supplier,
  canEdit,
}: {
  supplier: TpvSupplierRow;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(supplier.notes ?? "");
  const update = useUpdateSupplier();

  const save = () => {
    update.mutate(
      { id: supplier.id, patch: { notes: draft } as any },
      { onSuccess: () => setEditing(false) }
    );
  };

  return (
    <InfoBox
      title="Interná poznámka"
      canEdit={canEdit}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setDraft(supplier.notes ?? "");
      }}
      onSave={save}
      isSaving={update.isPending}
    >
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[100px]"
          placeholder="Spoľahlivosť, dovolenkový režim, kapacitné poznámky, kontaktné upozornenia…"
        />
      ) : supplier.notes ? (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {supplier.notes}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Žiadna interná poznámka.
        </p>
      )}
    </InfoBox>
  );
}

// ============================================================
// SHARED — InfoBox wrapper
// ============================================================

function InfoBox({
  title,
  canEdit,
  editing,
  onEdit,
  onCancel,
  onSave,
  isSaving,
  children,
}: {
  title: string;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          {title}
        </h4>
        {canEdit && !editing && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 -mr-2 text-xs"
            onClick={onEdit}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Upraviť
          </Button>
        )}
        {editing && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={onCancel}
              disabled={isSaving}
            >
              <X className="h-3 w-3 mr-1" />
              Zrušiť
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={onSave}
              disabled={isSaving}
            >
              <Save className="h-3 w-3 mr-1" />
              {isSaving ? "Ukladám…" : "Uložiť"}
            </Button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function FieldEdit({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 py-1">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn(!v && "text-muted-foreground")}>{v || "—"}</dd>
    </div>
  );
}
