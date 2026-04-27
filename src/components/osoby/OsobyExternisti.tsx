import { useMemo, useState } from "react";
import { fuzzyMatch, fuzzyMatchAny } from "@/lib/fuzzySearch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Search, Trash2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/hooks/use-toast";
import { SectionToolbar } from "@/components/shell/SectionToolbar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const ROLE_FLAGS = [
  { key: "is_pm", label: "PM" },
  { key: "is_kalkulant", label: "Kalkulant" },
  { key: "is_konstrukter", label: "Konstruktér" },
] as const;

const ARCHITEKT_LABEL = "Architekt";

/** Externisti color theme — teal/cyan to distinguish from interní bloky. */
const EXTERNAL_BADGE = "bg-cyan-100 text-cyan-800 border-cyan-300";

interface ExternalRow {
  id: string;
  name: string;
  role: string;
  firma: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  is_external: boolean;
  is_pm: boolean | null;
  is_kalkulant: boolean | null;
  is_konstrukter: boolean | null;
}

/** Deterministic pastel avatar color from name hash. */
function avatarStyles(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { bg: `hsl(${hue}, 65%, 90%)`, fg: `hsl(${hue}, 45%, 30%)` };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function rolesSummary(r: ExternalRow): string {
  const parts: string[] = [];
  if (r.is_pm) parts.push("PM");
  if (r.is_kalkulant) parts.push("Kalkulant");
  if (r.is_konstrukter) parts.push("Konstruktér");
  if (r.role === ARCHITEKT_LABEL) parts.push("Architekt");
  return parts.length ? parts.join(", ") : "—";
}

function useExternals() {
  return useQuery({
    queryKey: ["people", "externals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("people")
        .select("id, name, role, firma, phone, email, is_active, is_external, is_pm, is_kalkulant, is_konstrukter")
        .eq("source", "external")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any as ExternalRow[];
    },
  });
}

export function OsobyExternisti() {
  const qc = useQueryClient();
  const { data: rows = [] } = useExternals();
  const { canManageExternisti } = useAuth();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newRow, setNewRow] = useState({
    name: "",
    firma: "",
    phone: "",
    email: "",
    is_pm: false,
    is_kalkulant: false,
    is_konstrukter: false,
    is_architekt: false,
  });
  const [deleteFor, setDeleteFor] = useState<{ id: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter(r =>
      fuzzyMatchAny([r.name, r.firma, r.phone, r.email, rolesSummary(r)], q)
    );
  }, [rows, search]);

  /** Single "Externisté" group — sorted alphabetically. */
  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name, "cs"));
    return [["Externisté", sorted]] as Array<[string, ExternalRow[]]>;
  }, [filtered]);

  const updateField = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ExternalRow> }) => {
      const { error } = await supabase.from("people").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["people"] }),
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });

  const addExternal = useMutation({
    mutationFn: async () => {
      const flagsOn = newRow.is_pm || newRow.is_kalkulant || newRow.is_konstrukter || newRow.is_architekt;
      if (!flagsOn) throw new Error("Vyberte alespoň jednu roli");
      const primaryRole = newRow.is_pm
        ? "PM"
        : newRow.is_konstrukter
        ? "Konstruktér"
        : newRow.is_kalkulant
        ? "Kalkulant"
        : ARCHITEKT_LABEL;
      const { error } = await supabase
        .from("people")
        .insert({
          name: newRow.name.trim(),
          role: newRow.is_architekt ? ARCHITEKT_LABEL : primaryRole,
          firma: newRow.firma.trim() || null,
          phone: newRow.phone.trim() || null,
          email: newRow.email.trim() || null,
          is_external: true,
          is_active: true,
          source: "external",
          is_pm: newRow.is_pm,
          is_kalkulant: newRow.is_kalkulant,
          is_konstrukter: newRow.is_konstrukter,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      setAddOpen(false);
      setNewRow({ name: "", firma: "", phone: "", email: "", is_pm: false, is_kalkulant: false, is_konstrukter: false, is_architekt: false });
      toast({ title: "Externista přidán" });
    },
    onError: (e: any) => toast({ title: "Chyba", description: e.message, variant: "destructive" }),
  });

  const deleteExternal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("people").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["people"] });
      toast({ title: "Externista smazán" });
    },
  });

  const toggleRole = (
    r: ExternalRow,
    flag: "is_pm" | "is_kalkulant" | "is_konstrukter" | "is_architekt",
    next: boolean,
  ) => {
    if (flag === "is_architekt") {
      updateField.mutate({ id: r.id, patch: { role: next ? ARCHITEKT_LABEL : "" } as any });
      return;
    }
    updateField.mutate({ id: r.id, patch: { [flag]: next } as any });
  };

  const activeCount = rows.filter(r => r.is_active).length;

  /** Inline cell input — reveals border on hover/focus, matches Zaměstnanci style. */
  const inlineInput = "h-8 text-[13px] border-transparent hover:border-border focus:border-border bg-transparent px-2";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      <SectionToolbar
        left={
          <span className="text-xs text-muted-foreground">
            Externisté · {activeCount} aktivních z {rows.length}
          </span>
        }
        right={
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat externistu, firmu, kontakt…"
                className="pl-8 h-8 w-[280px] text-xs"
              />
            </div>
            {canManageExternisti && (
              <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Přidat externistu
              </Button>
            )}
          </>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 pb-4 pt-3 space-y-4">
        {grouped.map(([firma, members]) => {
          const isCollapsed = collapsed.has(firma);
          return (
          <section
            key={`${firma}-card`}
            className={cn("rounded-lg border shadow-sm overflow-hidden bg-card", "border-cyan-200")}
          >
            {/* Card header (clickable) */}
            <button
              type="button"
              onClick={() => toggleCollapsed(firma)}
              className={cn(
                "w-full flex items-center justify-between gap-3 px-3 py-2 border-b text-left transition-colors hover:brightness-95",
                "bg-cyan-50/80 border-cyan-200",
              )}
              aria-expanded={!isCollapsed}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="outline" className={cn("text-[11px] font-semibold border px-2.5 py-0.5 bg-background/80 shrink-0", EXTERNAL_BADGE)}>
                  {firma}
                </Badge>
                <span className="text-[12px] font-medium text-foreground/80">
                  {members.length} {members.length === 1 ? "osoba" : members.length < 5 ? "osoby" : "osob"}
                </span>
              </div>
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", isCollapsed && "-rotate-90")}
              />
            </button>

            {!isCollapsed && (
            <Table className="table-fixed">
              <colgroup>
                <col style={{ width: 260 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 200 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 50 }} />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Jméno</TableHead>
                  <TableHead>Firma</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Aktivní</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((r) => {
                  const av = avatarStyles(r.name);
                  const isArchitekt = r.role === ARCHITEKT_LABEL;
                  return (
                    <TableRow key={r.id} className={r.is_active ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div
                            className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                            style={{ backgroundColor: av.bg, color: av.fg }}
                            aria-hidden
                          >
                            {getInitials(r.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <Input
                              defaultValue={r.name}
                              onBlur={(e) => {
                                const v = e.target.value.trim();
                                if (v && v !== r.name) updateField.mutate({ id: r.id, patch: { name: v } });
                              }}
                              className={cn(inlineInput, "font-medium")}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={r.firma ?? ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (r.firma ?? null)) updateField.mutate({ id: r.id, patch: { firma: v as any } });
                          }}
                          className={inlineInput}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          defaultValue={r.phone ?? ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (r.phone ?? null)) updateField.mutate({ id: r.id, patch: { phone: v as any } });
                          }}
                          className={inlineInput}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="email"
                          defaultValue={r.email ?? ""}
                          placeholder="—"
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== (r.email ?? null)) updateField.mutate({ id: r.id, patch: { email: v as any } });
                          }}
                          className={inlineInput}
                        />
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={cn(
                                "h-8 w-full text-xs px-2 rounded-md border border-transparent bg-transparent text-left font-normal truncate",
                                "hover:border-border hover:bg-muted transition-colors",
                                "focus:border-border focus:bg-muted focus:outline-none",
                              )}
                            >
                              {rolesSummary(r)}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="start">
                            <div className="space-y-1.5">
                              {ROLE_FLAGS.map((rf) => (
                                <label key={rf.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                                  <Checkbox
                                    checked={!!r[rf.key]}
                                    onCheckedChange={(v) => toggleRole(r, rf.key, v === true)}
                                    className="h-4 w-4"
                                  />
                                  <span className="text-xs">{rf.label}</span>
                                </label>
                              ))}
                              <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer">
                                <Checkbox
                                  checked={isArchitekt}
                                  onCheckedChange={(v) => toggleRole(r, "is_architekt", v === true)}
                                  className="h-4 w-4"
                                />
                                <span className="text-xs">Architekt</span>
                              </label>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => updateField.mutate({ id: r.id, patch: { is_active: v } })}
                        />
                      </TableCell>
                      <TableCell>
                        {canManageExternisti && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteFor({ id: r.id, name: r.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
          </section>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Žádní externisté nenalezeni.
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Přidat externistu</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Jméno</Label>
              <Input value={newRow.name} onChange={(e) => setNewRow({ ...newRow, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Firma</Label>
              <Input value={newRow.firma} onChange={(e) => setNewRow({ ...newRow, firma: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={newRow.phone} onChange={(e) => setNewRow({ ...newRow, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={newRow.email} onChange={(e) => setNewRow({ ...newRow, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {ROLE_FLAGS.map((rf) => (
                  <label key={rf.key} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={newRow[rf.key as keyof typeof newRow] as boolean}
                      onCheckedChange={(v) => setNewRow({ ...newRow, [rf.key]: v === true })}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{rf.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={newRow.is_architekt}
                    onCheckedChange={(v) => setNewRow({ ...newRow, is_architekt: v === true })}
                    className="h-4 w-4"
                  />
                  <span className="text-sm">Architekt</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Zrušit</Button>
            <Button onClick={() => addExternal.mutate()} disabled={!newRow.name.trim() || addExternal.isPending}>
              Přidat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteFor}
        onConfirm={() => { if (deleteFor) deleteExternal.mutate(deleteFor.id); setDeleteFor(null); }}
        onCancel={() => setDeleteFor(null)}
        title="Smazat externistu?"
        description={deleteFor ? `Opravdu smazat "${deleteFor.name}"?` : ""}
      />
    </div>
  );
}
