/**
 * SupplierCRMDialog — main supplier modal with 5 tabs.
 *
 * Tabs: Prehľad / Kontakty / Zákazky / Cenník / Úlohy
 *
 * Used as a global modal — opens from anywhere via supplier_id.
 * The Subdodávky tab calls onOpenSupplier(id), parent renders this modal once.
 *
 * Audit/history is NOT a separate tab — it's accessible via the small
 * "História" button in the header (opens AuditTrail in a popover).
 */

import { useState } from "react";
import { Loader2, ExternalLink, History as HistoryIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { useSupplier } from "./hooks";
import { useSupplierAuditTrail, AuditTrail, formatDateLong } from "../shared";
import { OverviewPane } from "./panes/OverviewPane";
import { ContactsPane } from "./panes/ContactsPane";
import { JobsPane } from "./panes/JobsPane";
import { PricelistPane } from "./panes/PricelistPane";
import { TasksPane } from "./panes/TasksPane";
import { STAV_LABELS, REQUEST_STAV_LABELS } from "../subdodavky/helpers";
import type {
  SubcontractPermissions,
  SubcontractStav,
  RequestStav,
} from "../subdodavky/types";

interface SupplierCRMDialogProps {
  supplierId: string | null;
  permissions: SubcontractPermissions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = "overview" | "contacts" | "jobs" | "pricelist" | "tasks";

export function SupplierCRMDialog({
  supplierId,
  permissions,
  open,
  onOpenChange,
}: SupplierCRMDialogProps) {
  const [tab, setTab] = useState<Tab>("overview");
  const [showHistory, setShowHistory] = useState(false);

  const { data: supplier, isLoading: supplierLoading } = useSupplier(
    supplierId ?? undefined
  );

  const { data: auditEntries = [], isLoading: auditLoading } =
    useSupplierAuditTrail(showHistory ? supplierId ?? undefined : undefined);

  if (!supplierId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          {supplierLoading || !supplier ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Načítavam dodávateľa…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="text-xl flex items-center gap-3 flex-wrap">
                    {supplier.nazov}
                    {supplier.rating != null && supplier.rating > 0 && (
                      <span
                        className="text-amber-500 text-sm"
                        title={`Rating ${supplier.rating}/5`}
                      >
                        {"★".repeat(supplier.rating)}
                        <span className="text-muted-foreground/40">
                          {"★".repeat(5 - supplier.rating)}
                        </span>
                      </span>
                    )}
                    {!supplier.is_active && (
                      <span className="text-[10px] uppercase tracking-wide font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded">
                        Archivovaný
                      </span>
                    )}
                  </DialogTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                    {supplier.ico && <span>IČO {supplier.ico}</span>}
                    {supplier.dic && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>DIČ {supplier.dic}</span>
                      </>
                    )}
                    {supplier.created_at && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span>
                          Spolupráca od{" "}
                          {new Date(supplier.created_at).getFullYear()}
                        </span>
                      </>
                    )}
                    {supplier.kategorie?.length ? (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <div className="flex gap-1">
                          {supplier.kategorie.map((k) => (
                            <span
                              key={k}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
                <Button
                  variant={showHistory ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowHistory((v) => !v)}
                  title="História zmien"
                >
                  <HistoryIcon className="h-4 w-4 mr-1" />
                  História
                </Button>
              </div>
            </>
          )}
        </DialogHeader>

        {/* Tabs */}
        {!showHistory && (
          <div className="flex gap-6 px-6 border-b bg-card shrink-0">
            <TabBtn
              active={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              Prehľad
            </TabBtn>
            <TabBtn
              active={tab === "contacts"}
              onClick={() => setTab("contacts")}
            >
              Kontakty
            </TabBtn>
            <TabBtn active={tab === "jobs"} onClick={() => setTab("jobs")}>
              Zákazky
            </TabBtn>
            <TabBtn
              active={tab === "pricelist"}
              onClick={() => setTab("pricelist")}
            >
              Cenník
            </TabBtn>
            <TabBtn active={tab === "tasks"} onClick={() => setTab("tasks")}>
              Úlohy
            </TabBtn>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">
          {showHistory ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Posledných 100 zmien dotýkajúcich sa tohto dodávateľa
                (CRM údaje + subdodávky pridelené tomuto dodávateľovi).
              </p>
              <AuditTrail
                entries={auditEntries}
                isLoading={auditLoading}
                emptyMessage="Žiadne záznamy v histórii pre tohto dodávateľa."
                valueFormatter={(key, value) => {
                  if (key === "stav" && typeof value === "string") {
                    return (
                      STAV_LABELS[value as SubcontractStav] ??
                      REQUEST_STAV_LABELS[value as RequestStav] ??
                      undefined
                    );
                  }
                  return undefined;
                }}
              />
            </div>
          ) : (
            <>
              {tab === "overview" && (
                <OverviewPane
                  supplierId={supplierId}
                  permissions={permissions}
                />
              )}
              {tab === "contacts" && (
                <ContactsPane
                  supplierId={supplierId}
                  permissions={permissions}
                />
              )}
              {tab === "jobs" && <JobsPane supplierId={supplierId} />}
              {tab === "pricelist" && (
                <PricelistPane
                  supplierId={supplierId}
                  permissions={permissions}
                />
              )}
              {tab === "tasks" && (
                <TasksPane
                  supplierId={supplierId}
                  permissions={permissions}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {supplier && (
          <div className="px-6 py-2.5 border-t bg-muted/30 shrink-0 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Posledná aktualizácia:{" "}
              <strong className="text-foreground font-medium">
                {formatDateLong(supplier.updated_at)}
              </strong>
            </span>
            {supplier.web && (
              <a
                href={
                  supplier.web.startsWith("http")
                    ? supplier.web
                    : `https://${supplier.web}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:underline"
              >
                {supplier.web}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "py-2.5 text-sm font-medium relative transition-colors",
        active
          ? "text-foreground after:content-[''] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
