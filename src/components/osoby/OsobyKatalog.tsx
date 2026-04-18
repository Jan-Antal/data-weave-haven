import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Check, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePositionCatalogue, useUpsertPosition, useDeletePosition, useRenamePosition, useDeleteUsek, type CataloguePosition, type ProjectDropdownRole } from "@/hooks/useOsoby";
import { SectionToolbar } from "@/components/shell/SectionToolbar";
import { supabase } from "@/integrations/supabase/client";

const ROLE_LABELS: Record<string, string> = {
  pm: "PM dropdown",
  konstrukter: "Konstruktér dropdown",
  kalkulant: "Kalkulant dropdown",
};

export function OsobyKatalog() {
  const { data: rows = [] } = usePositionCatalogue();
  const upsert = useUpsertPosition();
  const rename = useRenamePosition();
  const del = useDeletePosition();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<{ stredisko: string; usek: string } | null>(null);
  const [newPozicia, setNewPozicia] = useState("");
  const [newUsek, setNewUsek] = useState<{ stredisko: string } | null>(null);
  const [newUsekName, setNewUsekName] = useState("");
  const [newStredisko, setNewStredisko] = useState("");
  const [showAddStredisko, setShowAddStredisko] = useState(false);
  const [deleteFor, setDeleteFor] = useState<CataloguePosition | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const commitRename = (p: CataloguePosition) => {
    if (!editing || editing.id !== p.id) return;
    const next = editing.value.trim();
    if (!next || next === p.pozicia) { setEditing(null); return; }
    rename.mutate(
      { id: p.id, stredisko: p.stredisko, usek: p.usek, oldName: p.pozicia, newName: next },
      { onSettled: () => setEditing(null) },
    );
  };

  const tree = useMemo(() => {
    const t = new Map<string, Map<string, CataloguePosition[]>>();
    for (const r of rows) {
      if (!t.has(r.stredisko)) t.set(r.stredisko, new Map());
      const sub = t.get(r.stredisko)!;
      if (!sub.has(r.usek)) sub.set(r.usek, []);
      sub.get(r.usek)!.push(r);
    }
    return t;
  }, [rows]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const handleRoleChange = (usekRows: CataloguePosition[], newRole: ProjectDropdownRole) => {
    // Apply role to ALL pozice rows in this úsek
    for (const r of usekRows) {
      upsert.mutate({ ...r, project_dropdown_role: newRole } as any);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card">
      <SectionToolbar
        left={
          <span className="text-xs text-muted-foreground">
            Strom <span className="font-medium text-foreground">Stredisko → Úsek → Pozice</span>
          </span>
        }
        right={
          <Button size="sm" variant="outline" className="h-8" onClick={() => setShowAddStredisko(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Stredisko
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {Array.from(tree.entries()).map(([stredisko, useks]) => {
          const sKey = `s::${stredisko}`;
          const sOpen = expanded.has(sKey);
          return (
            <div key={stredisko} className="border rounded-md">
              <button
                onClick={() => toggle(sKey)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-sm font-semibold"
              >
                {sOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {stredisko}
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  {useks.size} úseků
                </span>
              </button>
              {sOpen && (
                <div className="border-t px-3 py-2 space-y-1.5">
                  {Array.from(useks.entries()).map(([usek, list]) => {
                    const uKey = `u::${stredisko}::${usek}`;
                    const uOpen = expanded.has(uKey);
                    const role = list[0]?.project_dropdown_role ?? null;
                    return (
                      <div key={usek} className="border rounded">
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <button
                            onClick={() => toggle(uKey)}
                            className="flex items-center gap-1.5 text-sm flex-1 text-left hover:underline"
                          >
                            {uOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            <span className="font-medium">{usek}</span>
                            <span className="text-xs text-muted-foreground">({list.length})</span>
                          </button>
                          {role && (
                            <Badge variant="secondary" className="text-[10px]">
                              {ROLE_LABELS[role]}
                            </Badge>
                          )}
                          <Select
                            value={role ?? "none"}
                            onValueChange={(v) => handleRoleChange(list, v === "none" ? null : v as ProjectDropdownRole)}
                          >
                            <SelectTrigger className="h-7 w-[160px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Bez dropdownu</SelectItem>
                              <SelectItem value="pm">PM</SelectItem>
                              <SelectItem value="konstrukter">Konstruktér</SelectItem>
                              <SelectItem value="kalkulant">Kalkulant</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {uOpen && (
                          <div className="border-t px-3 py-2 space-y-1">
                            {list.map((p) => {
                              const isEditing = editing?.id === p.id;
                              return (
                                <div key={p.id} className="flex items-center gap-2 text-sm group">
                                  {isEditing ? (
                                    <>
                                      <Input
                                        autoFocus
                                        value={editing!.value}
                                        onChange={(e) => setEditing({ id: p.id, value: e.target.value })}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") commitRename(p);
                                          if (e.key === "Escape") setEditing(null);
                                        }}
                                        className="h-7 text-xs flex-1"
                                      />
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-primary"
                                        onClick={() => commitRename(p)}
                                        disabled={rename.isPending}
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground"
                                        onClick={() => setEditing(null)}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="flex-1">{p.pozicia}</span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                                        onClick={() => setEditing({ id: p.id, value: p.pozicia })}
                                        title="Přejmenovat pozici"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                        onClick={() => setDeleteFor(p)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {addingTo?.stredisko === stredisko && addingTo?.usek === usek ? (
                              <div className="flex gap-2 items-center pt-1">
                                <Input
                                  autoFocus
                                  value={newPozicia}
                                  onChange={(e) => setNewPozicia(e.target.value)}
                                  placeholder="Název pozice"
                                  className="h-7 text-xs"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && newPozicia.trim()) {
                                      upsert.mutate({
                                        stredisko, usek, pozicia: newPozicia.trim(),
                                        project_dropdown_role: role,
                                      });
                                      setNewPozicia("");
                                      setAddingTo(null);
                                    }
                                    if (e.key === "Escape") { setAddingTo(null); setNewPozicia(""); }
                                  }}
                                />
                                <Button
                                  size="sm"
                                  className="h-7 px-3"
                                  onClick={() => {
                                    if (!newPozicia.trim()) return;
                                    upsert.mutate({
                                      stredisko, usek, pozicia: newPozicia.trim(),
                                      project_dropdown_role: role,
                                    });
                                    setNewPozicia("");
                                    setAddingTo(null);
                                  }}
                                >
                                  Přidat
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setAddingTo({ stredisko, usek })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Pozici
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {newUsek?.stredisko === stredisko ? (
                    <div className="flex gap-2 items-center px-2">
                      <Input
                        autoFocus
                        value={newUsekName}
                        onChange={(e) => setNewUsekName(e.target.value)}
                        placeholder="Název úseku"
                        className="h-7 text-xs"
                      />
                      <Button
                        size="sm"
                        className="h-7 px-3"
                        onClick={() => {
                          if (!newUsekName.trim()) return;
                          // Create úsek with placeholder pozice
                          upsert.mutate({
                            stredisko,
                            usek: newUsekName.trim(),
                            pozicia: "Pracovník",
                            project_dropdown_role: null,
                          });
                          setNewUsekName("");
                          setNewUsek(null);
                        }}
                      >
                        Přidat
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setNewUsek(null)}>
                        Zrušit
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setNewUsek({ stredisko })}
                    >
                      <Plus className="h-3 w-3 mr-1" /> Úsek
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {showAddStredisko && (
          <div className="border rounded-md p-3 flex gap-2 items-center bg-muted/30">
            <Input
              autoFocus
              value={newStredisko}
              onChange={(e) => setNewStredisko(e.target.value)}
              placeholder="Název střediska"
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!newStredisko.trim()) return;
                upsert.mutate({
                  stredisko: newStredisko.trim(),
                  usek: "Nový úsek",
                  pozicia: "Pracovník",
                  project_dropdown_role: null,
                });
                setNewStredisko("");
                setShowAddStredisko(false);
              }}
            >
              Přidat
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAddStredisko(false)}>
              Zrušit
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteFor}
        onConfirm={() => { if (deleteFor) del.mutate(deleteFor.id); setDeleteFor(null); }}
        onCancel={() => setDeleteFor(null)}
        title="Smazat pozici?"
        description={deleteFor ? `Opravdu smazat "${deleteFor.pozicia}" (${deleteFor.usek})?` : ""}
      />
    </div>
  );
}
