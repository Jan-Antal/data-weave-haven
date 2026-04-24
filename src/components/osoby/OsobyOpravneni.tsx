import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, X, Search, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ROLE_LABELS,
  ROLE_PRESETS,
  PERMISSION_FLAGS,
  type Permissions,
  type PermissionFlag,
} from "@/lib/permissionPresets";
import type { AppRole } from "@/hooks/useAuth";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface ProfileLite {
  id: string;
  email: string;
  full_name: string;
}

interface UserRoleRow {
  user_id: string;
  role: AppRole;
  permissions: Partial<Permissions> | null;
}

const ROLE_ORDER: AppRole[] = [
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

type TriRow = {
  kind: "tri";
  label: string;
  desc?: string;
  read?: PermissionFlag; // optional — if missing, treat as implicit
  write: PermissionFlag;
};
type BinRow = {
  kind: "bin";
  label: string;
  desc?: string;
  flags: PermissionFlag[]; // toggled together
};
type Row = TriRow | BinRow;
type Group = { title: string; icon?: { bg: string; color: string }; rows: Row[] };

const GROUPS: Group[] = [
  {
    title: "Project Info",
    icon: { bg: "#E6F1FB", color: "#0C447C" },
    rows: [
      {
        kind: "bin",
        label: "Project Info",
        desc: "Základní info, finance, dokumenty",
        flags: ["canEdit"],
      },
      {
        kind: "bin",
        label: "PM Status",
        desc: "Riadenie projektu, milníky",
        flags: ["canEdit"],
      },
      {
        kind: "bin",
        label: "TPV Status",
        desc: "Prehľad TPV položiek",
        flags: ["canEdit"],
      },
      {
        kind: "bin",
        label: "TPV List",
        desc: "Položky, ceny, odoslanie do výroby",
        flags: ["canManageTPV"],
      },
      { kind: "bin", label: "Vytvořit projekt", flags: ["canCreateProject"] },
      { kind: "bin", label: "Smazat projekt", flags: ["canDeleteProject"] },
      {
        kind: "bin",
        label: "Upravit kód / smluvní termín",
        flags: ["canEditProjectCode", "canEditSmluvniTermin"],
      },
      { kind: "bin", label: "Vidět ceny & marže", flags: ["canSeePrices"] },
      { kind: "bin", label: "Réžijné projekty", flags: ["canManageOverheadProjects"] },
      {
        kind: "bin",
        label: "Nahrávať dokumenty",
        desc: "Upload do SharePoint",
        flags: ["canUploadDocuments"],
      },
      {
        kind: "bin",
        label: "Trvalé mazanie",
        desc: "Definitívne mazanie z koša (nezvratné)",
        flags: ["canPermanentDelete"],
      },
      {
        kind: "bin",
        label: "Prístup do Koša",
        desc: "Zobraziť a obnoviť zmazané položky",
        flags: ["canAccessRecycleBin"],
      },
    ],
  },
  {
    title: "Plán výroby",
    icon: { bg: "#EAF3DE", color: "#27500A" },
    rows: [
      {
        kind: "tri",
        label: "Plán výroby — Kanban / Tabulka",
        desc: "Zobrazenie a editácia plánovaných blokov",
        read: "canAccessPlanVyroby",
        write: "canWritePlanVyroby",
      },
      {
        kind: "bin",
        label: "Midflight",
        desc: "Import histórie do plánu",
        flags: ["canWritePlanVyroby"],
      },
      {
        kind: "bin",
        label: "Forecast",
        desc: "Generovanie a potvrdenie forecastu",
        flags: ["canWritePlanVyroby"],
      },
      {
        kind: "bin",
        label: "Daylog",
        desc: "Denný záznam progressu",
        flags: ["canAccessDaylog"],
      },
    ],
  },
  {
    title: "Modul výroba",
    icon: { bg: "#FAEEDA", color: "#633806" },
    rows: [
      {
        kind: "bin",
        label: "Modul výroba",
        desc: "Bundles, QC tracking",
        flags: ["canManageProduction"],
      },
      {
        kind: "bin",
        label: "Pouze QC",
        desc: "Len označenie hotovo / QC",
        flags: ["canQCOnly"],
      },
    ],
  },
  {
    title: "Analytics",
    icon: { bg: "#EEEDFE", color: "#3C3489" },
    rows: [
      {
        kind: "bin",
        label: "Analytics",
        desc: "Projektová analýza, Dílna, Výkaz",
        flags: ["canAccessAnalytics"],
      },
    ],
  },
  {
    title: "Správa osob & Nastavenia",
    icon: { bg: "#F1EFE8", color: "#5F5E5A" },
    rows: [
      {
        kind: "bin",
        label: "Správa osob",
        desc: "Zamestnanci, externisti, kapacita",
        flags: ["canManagePeople"],
      },
      { kind: "bin", label: "Externisti", flags: ["canManageExternisti"] },
      {
        kind: "bin",
        label: "Oprávnění",
        desc: "Správa rolí a oprávnení",
        flags: ["canManageUsers"],
      },
      {
        kind: "bin",
        label: "Nastavenia",
        desc: "Číselníky, kurzy, réžia, statusy",
        flags: ["canAccessSettings"],
      },
      {
        kind: "bin",
        label: "Spravovať kurzy mien",
        desc: "Editácia EUR/CZK kurzov",
        flags: ["canManageExchangeRates"],
      },
      {
        kind: "bin",
        label: "Spravovať stavy",
        desc: "Project status options, TPV status options",
        flags: ["canManageStatuses"],
      },
    ],
  },
];

function initials(name: string, email: string) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function permsEqual(a: Permissions, b: Partial<Permissions> | null | undefined) {
  if (!b) return false;
  for (const f of PERMISSION_FLAGS) {
    const av = !!a[f];
    const bv = typeof b[f] === "boolean" ? (b[f] as boolean) : null;
    if (bv === null) return false;
    if (av !== bv) return false;
  }
  return true;
}

export function OsobyOpravneni() {
  const { isOwner } = useAuth();
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole>("pm");
  const [draftPerms, setDraftPerms] = useState<Permissions>(
    () => ({ ...ROLE_PRESETS["pm"] }),
  );
  const [saving, setSaving] = useState(false);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserSearch, setAddUserSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState<{
    count: number;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ProfileLite | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profs }, { data: rls }] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name").order("full_name"),
      supabase.from("user_roles").select("user_id, role, permissions"),
    ]);
    setProfiles((profs ?? []) as ProfileLite[]);
    setRoles(
      ((rls ?? []) as any[]).map((r) => ({
        user_id: r.user_id,
        role: r.role as AppRole,
        permissions: (r.permissions as Partial<Permissions> | null) ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const visibleRoles = useMemo(
    () => ROLE_ORDER.filter((role) => isOwner || role !== "owner"),
    [isOwner],
  );

  const guardOwnerRole = () => {
    if (selectedRole !== "owner" || isOwner) return false;
    toast({
      title: "Roli Owner může spravovat pouze Owner.",
      variant: "destructive",
    });
    return true;
  };

  useEffect(() => {
    if (!visibleRoles.includes(selectedRole)) {
      setSelectedRole(visibleRoles[0] ?? "admin");
    }
  }, [selectedRole, visibleRoles]);

  // Reset draft when switching role
  useEffect(() => {
    setDraftPerms({ ...(ROLE_PRESETS[selectedRole] ?? ROLE_PRESETS.admin) });
  }, [selectedRole]);

  const profileById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    roles.forEach((r) => {
      counts[r.role] = (counts[r.role] ?? 0) + 1;
    });
    return counts;
  }, [roles]);

  // Count users in selected role that have custom (non-null, non-empty) overrides
  const customOverrideCount = useMemo(() => {
    return roles.filter(
      (r) =>
        r.role === selectedRole &&
        r.permissions &&
        Object.keys(r.permissions).length > 0,
    ).length;
  }, [roles, selectedRole]);

  const roleByUserId = useMemo(() => {
    const m = new Map<string, AppRole>();
    roles.forEach((r) => m.set(r.user_id, r.role));
    return m;
  }, [roles]);

  const userSearchResults = useMemo(() => {
    const s = userSearch.trim().toLowerCase();
    if (!s) return [];
    return profiles
      .filter((p) =>
        (p.full_name || "").toLowerCase().includes(s) ||
        (p.email || "").toLowerCase().includes(s),
      )
      .map((p) => ({ profile: p, role: roleByUserId.get(p.id) ?? "viewer" as AppRole }))
      .filter(({ role }) => visibleRoles.includes(role))
      .sort((a, b) =>
        (a.profile.full_name || a.profile.email).localeCompare(
          b.profile.full_name || b.profile.email,
          "cs",
        ),
      )
      .slice(0, 8);
  }, [profiles, roleByUserId, userSearch, visibleRoles]);

  const matchedRoleSet = useMemo(
    () => new Set(userSearchResults.map(({ role }) => role)),
    [userSearchResults],
  );

  const assignedUsers = useMemo(() => {
    return roles
      .filter((r) => r.role === selectedRole)
      .map((r) => profileById.get(r.user_id))
      .filter((p): p is ProfileLite => !!p)
      .sort((a, b) =>
        (a.full_name || a.email).localeCompare(b.full_name || b.email, "cs"),
      );
  }, [roles, selectedRole, profileById]);

  const availableUsers = useMemo(() => {
    const inRole = new Set(
      roles.filter((r) => r.role === selectedRole).map((r) => r.user_id),
    );
    const s = addUserSearch.trim().toLowerCase();
    return profiles
      .filter((p) => !inRole.has(p.id))
      .filter((p) => {
        if (!s) return true;
        return (
          (p.full_name || "").toLowerCase().includes(s) ||
          (p.email || "").toLowerCase().includes(s)
        );
      })
      .slice(0, 50);
  }, [profiles, roles, selectedRole, addUserSearch]);

  const setBin = (flags: PermissionFlag[], value: boolean) => {
    setDraftPerms((d) => {
      const next = { ...d };
      flags.forEach((f) => {
        next[f] = value;
      });
      return next;
    });
  };

  const setTri = (
    row: TriRow,
    state: "none" | "read" | "write",
  ) => {
    setDraftPerms((d) => {
      const next = { ...d };
      if (row.read) {
        next[row.read] = state === "read" || state === "write";
      }
      next[row.write] = state === "write";
      return next;
    });
  };

  const triState = (row: TriRow): "none" | "read" | "write" => {
    if (draftPerms[row.write]) return "write";
    if (row.read && draftPerms[row.read]) return "read";
    if (!row.read) {
      // implicit read — "none" if write false (we have no signal); default to "read"
      return "read";
    }
    return "none";
  };

  const binState = (row: BinRow): boolean => {
    return row.flags.every((f) => draftPerms[f]);
  };

  const handleSave = async () => {
    if (guardOwnerRole()) return;
    const targets = roles.filter((r) => r.role === selectedRole);
    if (targets.length === 0) {
      toast({ title: "Žiadni používatelia v tejto roli" });
      return;
    }
    const customCount = targets.filter(
      (r) =>
        r.permissions &&
        Object.keys(r.permissions).length > 0 &&
        !permsEqual(ROLE_PRESETS[selectedRole], r.permissions),
    ).length;
    if (customCount > 0) {
      setConfirmOverwrite({ count: customCount });
      return;
    }
    await persistSave();
  };

  const persistSave = async () => {
    if (guardOwnerRole()) return;
    setSaving(true);
    setConfirmOverwrite(null);
    const { error } = await supabase
      .from("user_roles")
      .update({ permissions: draftPerms as any })
      .eq("role", selectedRole);
    setSaving(false);
    if (error) {
      toast({
        title: "Chyba pri ukladaní",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `Uložené pre ${ROLE_LABELS[selectedRole]}` });
    fetchAll();
  };

  const handleDuplicate = () => {
    toast({
      title: "Duplikovať",
      description:
        "Nové role je možné pridať len cez DB migráciu (enum app_role).",
    });
  };

  const handleAddUser = async (p: ProfileLite) => {
    if (guardOwnerRole()) return;
    const existing = roles.find((r) => r.user_id === p.id);
    const { error } = existing
      ? await supabase
          .from("user_roles")
          .update({ role: selectedRole })
          .eq("user_id", p.id)
      : await supabase
          .from("user_roles")
          .insert({ user_id: p.id, role: selectedRole } as any);
    if (error) {
      toast({
        title: "Chyba",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: `${p.full_name || p.email} priradený` });
    setAddUserOpen(false);
    setAddUserSearch("");
    fetchAll();
  };

  const handleRemoveUser = async () => {
    if (!confirmRemove) return;
    if (guardOwnerRole()) return;
    const { error } = await supabase
      .from("user_roles")
      .update({ role: "viewer" as any })
      .eq("user_id", confirmRemove.id);
    if (error) {
      toast({
        title: "Chyba",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Používateľ presunutý do Viewer" });
    setConfirmRemove(null);
    fetchAll();
  };

  const handleNewRole = () => {
    toast({
      title: "Nová rola",
      description:
        "Nové role je možné pridať len cez DB migráciu (enum app_role).",
    });
  };

  return (
    <div className="h-full flex bg-card">
      {/* LEFT SIDEBAR */}
      <aside className="shrink-0 w-[220px] border-r border-border/60 bg-muted/30 flex flex-col">
        <div className="px-4 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Roly
        </div>
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Hľadať osobu…"
              className="h-8 pl-8 pr-8 text-xs bg-background"
            />
            {userSearch && (
              <button
                onClick={() => setUserSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Vymazať hľadanie"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {userSearch.trim() && (
            <div className="mt-2 rounded-md border border-border/60 bg-background shadow-sm overflow-hidden">
              {userSearchResults.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-muted-foreground text-center">
                  Osoba nenájdená
                </div>
              ) : (
                userSearchResults.map(({ profile, role }) => (
                  <button
                    key={profile.id}
                    onClick={() => setSelectedRole(role)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-muted transition-colors"
                  >
                    <Avatar className="h-6 w-6 shrink-0">
                      <AvatarFallback className="text-[10px] font-medium">
                        {initials(profile.full_name, profile.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate text-foreground">
                        {profile.full_name || profile.email}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {ROLE_LABELS[role]}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {visibleRoles.map((r) => {
            const active = r === selectedRole;
            const count = roleCounts[r] ?? 0;
            const matched = matchedRoleSet.has(r);
            return (
              <button
                key={r}
                onClick={() => setSelectedRole(r)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-xs transition-colors text-left",
                  active
                    ? "bg-background font-medium text-foreground border-l-2 border-[#0a2e28] pl-[10px]"
                    : matched
                    ? "bg-accent/15 text-foreground ring-1 ring-accent/30"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <span className="truncate">{ROLE_LABELS[r]}</span>
                <span
                  className={cn(
                    "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full",
                    active
                      ? "bg-[#0a2e28] text-white"
                      : matched
                      ? "bg-accent/25 text-accent-foreground"
                      : "bg-muted-foreground/10 text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={handleNewRole}
          className="m-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md flex items-center gap-1.5 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nová rola
        </button>
      </aside>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-border/60">
          <div>
            <h2 className="text-base font-medium text-foreground">
              {ROLE_LABELS[selectedRole]}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {assignedUsers.length}{" "}
              {assignedUsers.length === 1
                ? "používateľ"
                : assignedUsers.length >= 2 && assignedUsers.length <= 4
                ? "používatelia"
                : "používateľov"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleDuplicate}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Duplikovať
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-[#0a2e28] hover:bg-[#0a2e28]/90 text-white"
              onClick={handleSave}
              disabled={saving || loading}
            >
              {saving ? "Ukladám…" : "Uložit"}
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Assigned users */}
          <section>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Pridelení uživatelia
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {assignedUsers.map((u) => (
                <div
                  key={u.id}
                  className="group inline-flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-muted/60 border border-border/60"
                >
                  <Avatar className="h-5 w-5">
                    <AvatarFallback className="text-[9px] font-medium">
                      {initials(u.full_name, u.email)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-[11px] text-foreground max-w-[140px] truncate">
                    {u.full_name || u.email}
                  </span>
                  <button
                    onClick={() => setConfirmRemove(u)}
                    className="opacity-50 hover:opacity-100 transition-opacity"
                    title="Odobrať z roly"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <Popover open={addUserOpen} onOpenChange={setAddUserOpen}>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors">
                    <Plus className="h-3 w-3" />
                    Přidat uživatele
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[280px] p-2"
                >
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      autoFocus
                      value={addUserSearch}
                      onChange={(e) => setAddUserSearch(e.target.value)}
                      placeholder="Hľadať…"
                      className="h-8 pl-7 text-xs"
                    />
                  </div>
                  <div className="max-h-[260px] overflow-y-auto">
                    {availableUsers.length === 0 ? (
                      <div className="text-[11px] text-muted-foreground text-center py-3">
                        Žiadni voľní používatelia
                      </div>
                    ) : (
                      availableUsers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleAddUser(p)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-left"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-[10px]">
                              {initials(p.full_name, p.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium truncate">
                              {p.full_name || "—"}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {p.email}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </section>

          {/* Permissions */}
          {GROUPS.map((g) => (
            <section
              key={g.title}
              className="rounded-md overflow-hidden border border-border/40"
              style={{
                borderLeft: g.icon ? `3px solid ${g.icon.color}` : undefined,
                background: g.icon ? `${g.icon.bg}40` : undefined,
              }}
            >
              <h3
                className="text-[12px] font-semibold uppercase tracking-wider px-3 py-2"
                style={{
                  background: g.icon?.bg,
                  color: g.icon?.color,
                }}
              >
                {g.title}
              </h3>
              <div className="divide-y divide-border/40 px-3">
                {g.rows.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] text-foreground">
                        {row.label}
                      </div>
                      {row.desc && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {row.desc}
                        </div>
                      )}
                    </div>
                    {row.kind === "tri" ? (
                      <TriToggle
                        value={triState(row)}
                        onChange={(v) => setTri(row, v)}
                      />
                    ) : (
                      <BinToggle
                        value={binState(row)}
                        onChange={(v) => setBin(row.flags, v)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Confirm overwrite */}
      <AlertDialog
        open={!!confirmOverwrite}
        onOpenChange={(o) => !o && setConfirmOverwrite(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prepísať vlastné úpravy?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOverwrite?.count} používateľ(ov) má vlastné úpravy
              oprávnení odlišné od predvoleného presetu. Uložením prepíšete ich
              individuálne nastavenia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#0a2e28] hover:bg-[#0a2e28]/90 text-white"
              onClick={persistSave}
            >
              Potvrdiť a prepísať
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm remove user */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odobrať z roly?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.full_name || confirmRemove?.email} bude presunutý
              do role "Viewer". Túto operáciu môžete kedykoľvek zvrátiť
              priradením do inej roly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveUser}>
              Odobrať
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------------- Toggle widgets ---------------- */

function SegBase({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-muted/60 shrink-0">
      {children}
    </div>
  );
}

function SegBtn({
  selected,
  variant,
  onClick,
  children,
}: {
  selected: boolean;
  variant: "neutral" | "read" | "write";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles = selected
    ? variant === "read"
      ? "bg-[#FFF1E0] text-[#9A4A00] border-[#F4B66A]"
      : variant === "write"
      ? "bg-[#EAF3DE] text-[#27500A] border-[#97C459]"
      : "bg-[#FDECEC] text-[#B42318] border-[#F4A6A0]"
    : "bg-transparent text-muted-foreground border-transparent hover:text-foreground";
  return (
    <button
      onClick={onClick}
      className={cn(
        "text-[11px] px-2.5 py-1 rounded border-[0.5px] transition-colors",
        styles,
      )}
    >
      {children}
    </button>
  );
}

function TriToggle({
  value,
  onChange,
}: {
  value: "none" | "read" | "write";
  onChange: (v: "none" | "read" | "write") => void;
}) {
  return (
    <SegBase>
      <SegBtn
        selected={value === "none"}
        variant="neutral"
        onClick={() => onChange("none")}
      >
        Ne
      </SegBtn>
      <SegBtn
        selected={value === "read"}
        variant="read"
        onClick={() => onChange("read")}
      >
        Čítať
      </SegBtn>
      <SegBtn
        selected={value === "write"}
        variant="write"
        onClick={() => onChange("write")}
      >
        Upraviť
      </SegBtn>
    </SegBase>
  );
}

function BinToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SegBase>
      <SegBtn
        selected={!value}
        variant="neutral"
        onClick={() => onChange(false)}
      >
        Ne
      </SegBtn>
      <SegBtn
        selected={value}
        variant="write"
        onClick={() => onChange(true)}
      >
        <span className="inline-flex items-center gap-1">
          <Check className="h-3 w-3" strokeWidth={3} />
          Áno
        </span>
      </SegBtn>
    </SegBase>
  );
}
