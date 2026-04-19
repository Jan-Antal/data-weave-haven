import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type GroupDef = { title: string; flags: PermissionFlag[] };

const GROUPS: GroupDef[] = [
  {
    title: "Projekty",
    flags: [
      "canCreateProject",
      "canDeleteProject",
      "canEditProjectCode",
      "canEditSmluvniTermin",
      "canSeePrices",
    ],
  },
  {
    title: "TPV & dokumenty",
    flags: ["canManageTPV", "canUploadDocuments", "canPermanentDelete"],
  },
  {
    title: "Plán výroby",
    flags: [
      "canAccessPlanVyroby",
      "canWritePlanVyroby",
      "canAccessDaylog",
      "canQCOnly",
    ],
  },
  {
    title: "Analytika & nastavení",
    flags: [
      "canAccessAnalytics",
      "canAccessSettings",
      "canManageUsers",
      "canManagePeople",
      "canManageExternisti",
    ],
  },
];

const FRIENDLY_LABELS: Partial<Record<PermissionFlag, string>> = {
  canCreateProject: "Vytvořit projekt",
  canDeleteProject: "Smazat projekt",
  canEditProjectCode: "Upravit kód projektu",
  canEditSmluvniTermin: "Upravit smluvní termín",
  canSeePrices: "Zobrazit ceny",
  canManageTPV: "Spravovat TPV",
  canUploadDocuments: "Nahrávat dokumenty",
  canPermanentDelete: "Trvale mazat",
  canAccessPlanVyroby: "Zobrazit Plán výroby",
  canWritePlanVyroby: "Editovat Plán výroby",
  canAccessDaylog: "Denní log (Daylog)",
  canQCOnly: "Pouze QC",
  canAccessAnalytics: "Analytika",
  canAccessSettings: "Nastavení",
  canManageUsers: "Správa uživatelů",
  canManagePeople: "Správa lidí",
  canManageExternisti: "Správa externistů",
};

function labelOf(flag: PermissionFlag) {
  return FRIENDLY_LABELS[flag] ?? PERMISSION_LABELS[flag];
}

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Permissions | null>(null);
  const [draftRole, setDraftRole] = useState<AppRole | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").order("full_name"),
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

  const toggleExpand = (u: UserRow) => {
    if (expandedId === u.id) {
      setExpandedId(null);
      setDraft(null);
      setDraftRole(null);
      return;
    }
    setExpandedId(u.id);
    setDraftRole(u.role);
    setDraft(resolvePermissions(u.role, u.permissions));
  };

  const applyPreset = (role: AppRole) => {
    setDraftRole(role);
    setDraft({ ...ROLE_PRESETS[role] });
  };

  const setFlag = (flag: PermissionFlag, val: boolean) => {
    setDraft((d) => (d ? { ...d, [flag]: val } : d));
  };

  const save = async (u: UserRow) => {
    if (!draft || !draftRole) return;
    setSaving(true);
    const { error } = await supabase
      .from("user_roles")
      .update({ role: draftRole, permissions: draft as any })
      .eq("user_id", u.id);
    setSaving(false);
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
        x.id === u.id ? { ...x, role: draftRole, permissions: draft } : x,
      ),
    );
    setExpandedId(null);
    setDraft(null);
    setDraftRole(null);
  };

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, "cs"),
      ),
    [users],
  );

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="px-6 py-4 border-b border-border/60 flex items-center gap-2">
        <Shield className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Oprávnění uživatelů</h2>
        <span className="text-xs text-muted-foreground ml-2">
          {users.length} uživatelů
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="grid grid-cols-[40px_1fr_180px_120px_32px] items-center gap-3 px-6 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60 bg-muted/30 sticky top-0 z-10">
          <div />
          <div>Jméno / email</div>
          <div>Preset role</div>
          <div>Vlastní úpravy</div>
          <div />
        </div>

        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            Načítání…
          </div>
        ) : sortedUsers.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            Žádní uživatelé
          </div>
        ) : (
          sortedUsers.map((u) => {
            const isExpanded = expandedId === u.id;
            const diffs = diffsFromPreset(u.role, u.permissions);
            return (
              <div key={u.id} className="border-b border-border/60">
                <button
                  type="button"
                  onClick={() => toggleExpand(u)}
                  className={cn(
                    "w-full grid grid-cols-[40px_1fr_180px_120px_32px] items-center gap-3 px-6 py-2.5 text-left hover:bg-muted/40 transition-colors",
                    isExpanded && "bg-muted/40",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-[11px] font-medium">
                      {initials(u.full_name, u.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {u.full_name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.email}
                    </div>
                  </div>
                  <div className="text-xs">
                    {u.role ? (
                      <Badge variant="secondary" className="font-normal">
                        {ROLE_LABELS[u.role]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div>
                    {diffs > 0 ? (
                      <Badge className="bg-warning hover:bg-warning text-warning-foreground font-normal">
                        Vlastní · {diffs}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        výchozí
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </div>
                </button>

                {isExpanded && draft && (
                  <div className="px-6 pb-5 pt-2 bg-muted/20">
                    {/* Preset bar */}
                    <div className="flex items-center gap-3 flex-wrap mb-4 p-3 rounded-md border border-border/60 bg-card">
                      <span className="text-xs font-medium text-muted-foreground">
                        Preset:
                      </span>
                      <Select
                        value={draftRole ?? undefined}
                        onValueChange={(v) => setDraftRole(v as AppRole)}
                      >
                        <SelectTrigger className="h-8 w-[200px] text-xs">
                          <SelectValue placeholder="Vyberte preset" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRESET_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => draftRole && applyPreset(draftRole)}
                        disabled={!draftRole}
                      >
                        Použít preset
                      </Button>
                      <div className="flex-1" />
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => save(u)}
                        disabled={saving || !draftRole}
                      >
                        {saving ? "Ukládám…" : "Uložit"}
                      </Button>
                    </div>

                    {/* Groups */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {GROUPS.map((g) => (
                        <div
                          key={g.title}
                          className="rounded-md border border-border/60 bg-card p-3"
                        >
                          <div className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border/60">
                            {g.title}
                          </div>
                          <div className="space-y-2">
                            {g.flags.map((flag) => {
                              const id = `${u.id}-${flag}`;
                              return (
                                <label
                                  key={flag}
                                  htmlFor={id}
                                  className="flex items-center gap-2 cursor-pointer text-xs hover:text-foreground transition-colors"
                                >
                                  <Checkbox
                                    id={id}
                                    checked={!!draft[flag]}
                                    onCheckedChange={(v) =>
                                      setFlag(flag, v === true)
                                    }
                                    className="h-4 w-4"
                                  />
                                  <span>{labelOf(flag)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
