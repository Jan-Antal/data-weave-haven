import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Search, Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PERMISSION_FLAGS,
  PERMISSION_LABELS,
  ROLE_LABELS,
  ROLE_PRESETS,
  resolvePermissions,
  type Permissions,
  type PermissionFlag,
} from "@/lib/permissionPresets";
import type { AppRole } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: AppRole | null;
  permissions: Partial<Permissions> | null;
}

const PRESET_ROLES: AppRole[] = [
  "owner",
  "admin",
  "vedouci_pm",
  "pm",
  "vedouci_konstrukter",
  "konstrukter",
  "vedouci_vyroby",
  "mistr",
  "quality",
  "kalkulant",
  "viewer",
];

type ColDef = { flag: PermissionFlag; short: string };
type GroupDef = { title: string; cols: ColDef[] };

const GROUPS: GroupDef[] = [
  {
    title: "Projekty",
    cols: [
      { flag: "canCreateProject", short: "Vytvořit" },
      { flag: "canDeleteProject", short: "Smazat" },
      { flag: "canSeePrices", short: "Ceny" },
      { flag: "canEditProjectCode", short: "Kód/termín" },
    ],
  },
  {
    title: "TPV & dok.",
    cols: [
      { flag: "canManageTPV", short: "TPV" },
      { flag: "canUploadDocuments", short: "Dok." },
      { flag: "canPermanentDelete", short: "Mazat" },
    ],
  },
  {
    title: "Plán výroby",
    cols: [
      { flag: "canAccessPlanVyroby", short: "Zobrazit" },
      { flag: "canWritePlanVyroby", short: "Editovat" },
      { flag: "canAccessDaylog", short: "Daylog" },
      { flag: "canQCOnly", short: "QC" },
    ],
  },
  {
    title: "Analytika & správa",
    cols: [
      { flag: "canAccessAnalytics", short: "Analytika" },
      { flag: "canManagePeople", short: "Lidé" },
      { flag: "canAccessSettings", short: "Nastavení" },
    ],
  },
];

const ALL_COLS: ColDef[] = GROUPS.flatMap((g) => g.cols);

function initials(name: string, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function diffsFromPreset(
  role: AppRole | null,
  perms: Partial<Permissions> | null,
): number {
  if (!role || !perms) return 0;
  const preset = ROLE_PRESETS[role];
  let n = 0;
  for (const f of PERMISSION_FLAGS) {
    if (typeof perms[f] === "boolean" && perms[f] !== preset[f]) n += 1;
  }
  return n;
}

export function OsobyOpravneni() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [presetFilter, setPresetFilter] = useState<string>("__all__");
  const [drafts, setDrafts] = useState<
    Record<string, { role: AppRole; perms: Permissions }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, full_name")
        .order("full_name"),
      supabase.from("user_roles").select("user_id, role, permissions"),
    ]);
    const roleMap = new Map<
      string,
      { role: AppRole; permissions: Partial<Permissions> | null }
    >();
    roles?.forEach((r: any) =>
      roleMap.set(r.user_id, {
        role: r.role,
        permissions: (r.permissions as Partial<Permissions> | null) ?? null,
      }),
    );
    setUsers(
      (profiles ?? []).map((p: any) => {
        const r = roleMap.get(p.id);
        return {
          id: p.id,
          email: p.email,
          full_name: p.full_name,
          role: r?.role ?? null,
          permissions: r?.permissions ?? null,
        };
      }),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users
      .filter((u) => {
        if (presetFilter !== "__all__" && u.role !== presetFilter) return false;
        if (!s) return true;
        return (
          (u.full_name || "").toLowerCase().includes(s) ||
          (u.email || "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, "cs"),
      );
  }, [users, search, presetFilter]);

  const getEffective = (u: UserRow) => {
    const draft = drafts[u.id];
    if (draft) return { role: draft.role, perms: draft.perms };
    return {
      role: u.role,
      perms: resolvePermissions(u.role, u.permissions),
    };
  };

  const isCellOverride = (u: UserRow, flag: PermissionFlag, value: boolean) => {
    const role = drafts[u.id]?.role ?? u.role;
    if (!role) return false;
    return ROLE_PRESETS[role][flag] !== value;
  };

  const toggleCell = (u: UserRow, flag: PermissionFlag) => {
    const eff = getEffective(u);
    if (!eff.role) return;
    const next: Permissions = { ...eff.perms, [flag]: !eff.perms[flag] };
    setDrafts((d) => ({
      ...d,
      [u.id]: { role: eff.role as AppRole, perms: next },
    }));
  };

  const applyPreset = (u: UserRow, role: AppRole) => {
    setDrafts((d) => ({
      ...d,
      [u.id]: { role, perms: { ...ROLE_PRESETS[role] } },
    }));
  };

  const cancelDraft = (u: UserRow) => {
    setDrafts((d) => {
      const { [u.id]: _, ...rest } = d;
      return rest;
    });
  };

  const saveDraft = async (u: UserRow) => {
    const draft = drafts[u.id];
    if (!draft) return;
    setSavingId(u.id);
    const { error } = await supabase
      .from("user_roles")
      .update({ role: draft.role, permissions: draft.perms as any })
      .eq("user_id", u.id);
    setSavingId(null);
    if (error) {
      toast({
        title: "Chyba při ukládání",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Oprávnění uložena" });
    setUsers((prev) =>
      prev.map((x) =>
        x.id === u.id
          ? { ...x, role: draft.role, permissions: draft.perms }
          : x,
      ),
    );
    cancelDraft(u);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full flex flex-col bg-card">
        {/* Toolbar */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-6 h-12 border-b border-border/60 bg-card">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat jméno / email…"
                className="h-8 w-[240px] pl-7 text-xs"
              />
            </div>
            <Select value={presetFilter} onValueChange={setPresetFilter}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="Všechny presety" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Všechny presety</SelectItem>
                {PRESET_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-[11px] text-muted-foreground shrink-0">
            Klikni do bunky pre prepnutie • oranžová = vlastné oprávnění
          </div>
        </div>

        {/* Matrix */}
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs">
            {/* Group header row */}
            <thead className="sticky top-0 z-30 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
              <tr>
                <th
                  className="sticky left-0 z-40 bg-card border-b border-r border-border/60 px-3 py-2 text-left font-medium text-muted-foreground min-w-[260px]"
                  rowSpan={2}
                >
                  Uživatel
                </th>
                <th
                  className="sticky left-[260px] z-40 bg-card border-b border-r border-border/60 px-3 py-2 text-left font-medium text-muted-foreground min-w-[180px]"
                  rowSpan={2}
                >
                  Preset
                </th>
                {GROUPS.map((g) => (
                  <th
                    key={g.title}
                    colSpan={g.cols.length}
                    className="px-2 py-1.5 text-center text-[10px] uppercase tracking-wide font-semibold text-muted-foreground bg-muted/40 border-b border-l border-border/60"
                  >
                    {g.title}
                  </th>
                ))}
                <th
                  className="bg-card border-b border-l border-border/60 min-w-[180px]"
                  rowSpan={2}
                />
              </tr>
              <tr>
                {ALL_COLS.map((c, idx) => {
                  const groupBoundary = GROUPS.some(
                    (g, gi) =>
                      gi > 0 &&
                      g.cols[0].flag === c.flag &&
                      idx ===
                        GROUPS.slice(0, gi).reduce(
                          (s, gg) => s + gg.cols.length,
                          0,
                        ),
                  );
                  return (
                    <Tooltip key={c.flag}>
                      <TooltipTrigger asChild>
                        <th
                          className={cn(
                            "h-[110px] w-[44px] min-w-[44px] max-w-[44px] border-b border-border/60 bg-muted/20 align-bottom p-0 cursor-help",
                            groupBoundary && "border-l border-border/60",
                          )}
                        >
                          <div className="flex items-end justify-center h-full pb-2">
                            <div
                              className="text-[11px] font-medium text-foreground whitespace-nowrap"
                              style={{
                                writingMode: "vertical-rl",
                                transform: "rotate(180deg)",
                              }}
                            >
                              {c.short}
                            </div>
                          </div>
                        </th>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {PERMISSION_LABELS[c.flag]}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={2 + ALL_COLS.length + 1}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    Načítání…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + ALL_COLS.length + 1}
                    className="px-6 py-8 text-center text-muted-foreground"
                  >
                    Žádní uživatelé
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const eff = getEffective(u);
                  const hasDraft = !!drafts[u.id];
                  const savedDiffs = diffsFromPreset(u.role, u.permissions);
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "border-b border-border/60 hover:bg-muted/30 transition-colors",
                        hasDraft && "bg-warning/5",
                      )}
                    >
                      {/* Sticky user cell */}
                      <td className="sticky left-0 z-20 bg-card border-r border-border/60 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-[10px] font-medium">
                                {initials(u.full_name, u.email)}
                              </AvatarFallback>
                            </Avatar>
                            {hasDraft && (
                              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-warning border-2 border-card" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate max-w-[180px]">
                              {u.full_name || "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Sticky preset cell */}
                      <td className="sticky left-[260px] z-20 bg-card border-r border-border/60 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="inline-flex">
                                <Badge
                                  variant="secondary"
                                  className="font-normal text-[10px] cursor-pointer hover:bg-secondary/80"
                                >
                                  {eff.role ? ROLE_LABELS[eff.role] : "—"}
                                </Badge>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[220px] p-2"
                              align="start"
                            >
                              <div className="text-[11px] font-medium text-muted-foreground mb-2 px-1">
                                Použít preset
                              </div>
                              <div className="flex flex-col gap-0.5 max-h-[260px] overflow-y-auto">
                                {PRESET_ROLES.map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => applyPreset(u, r)}
                                    className={cn(
                                      "text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors",
                                      eff.role === r &&
                                        "bg-muted font-medium",
                                    )}
                                  >
                                    {ROLE_LABELS[r]}
                                  </button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                          {(hasDraft
                            ? diffsFromPreset(eff.role, eff.perms)
                            : savedDiffs) > 0 && (
                            <Badge className="bg-warning hover:bg-warning text-warning-foreground font-normal text-[10px] px-1.5 py-0">
                              Vlastní
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Permission cells */}
                      {GROUPS.map((g, gi) =>
                        g.cols.map((c, ci) => {
                          const value = !!eff.perms[c.flag];
                          const override = isCellOverride(u, c.flag, value);
                          return (
                            <td
                              key={c.flag}
                              className={cn(
                                "p-0 text-center border-b border-border/60",
                                ci === 0 && gi > 0 && "border-l",
                              )}
                            >
                              <button
                                onClick={() => toggleCell(u, c.flag)}
                                className={cn(
                                  "w-[44px] h-[36px] flex items-center justify-center transition-colors",
                                  value
                                    ? override
                                      ? "bg-warning/20 text-warning hover:bg-warning/30"
                                      : "text-success hover:bg-success/10"
                                    : override
                                    ? "bg-warning/20 text-warning hover:bg-warning/30"
                                    : "text-muted-foreground/50 hover:bg-muted",
                                )}
                                title={PERMISSION_LABELS[c.flag]}
                              >
                                {value ? (
                                  <Check className="h-4 w-4" strokeWidth={3} />
                                ) : (
                                  <Minus className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>
                          );
                        }),
                      )}

                      {/* Action cell */}
                      <td className="border-b border-l border-border/60 px-2 py-1.5 bg-card">
                        {hasDraft ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              onClick={() => saveDraft(u)}
                              disabled={savingId === u.id}
                            >
                              {savingId === u.id ? "…" : "Uložit"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-[11px] px-2"
                              onClick={() => cancelDraft(u)}
                            >
                              Zrušit
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
