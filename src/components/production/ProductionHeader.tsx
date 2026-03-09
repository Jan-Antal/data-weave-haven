import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { LayoutDashboard, Settings, Check, User, UserCog, LogOut, Undo2, Redo2, Search, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { UserManagement } from "@/components/UserManagement";
import { AccountSettings } from "@/components/AccountSettings";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { DataLogPanel } from "@/components/DataLogPanel";
import { CapacitySettings } from "@/components/production/CapacitySettings";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

type DisplayMode = "hours" | "czk" | "percent";

interface ProductionHeaderProps {
  displayMode: DisplayMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function ProductionHeader({ displayMode, onDisplayModeChange, searchQuery, onSearchChange }: ProductionHeaderProps) {
  const navigate = useNavigate();
  const { data: settings } = useProductionSettings();
  const { canAccessSettings, isAdmin, isOwner, realRole, simulatedRole, setSimulatedRole, role, canManageUsers, canManagePeople, canManageExchangeRates, canManageStatuses, canAccessRecycleBin, profile, signOut } = useAuth();
  const { openPeopleManagement } = usePeopleManagement();
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [dataLogOpen, setDataLogOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);

  const toggleDataLog = useCallback(() => setDataLogOpen((p) => !p), []);

  return (
    <>
      <header className="border-b bg-primary px-6 py-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/30 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans font-medium">Plán Výroby</span>
          </div>

          {/* Center: Search bar */}
          <div className="flex-1 max-w-[280px] mx-4 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary-foreground/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Hledat projekt..."
              className="w-full h-8 pl-8 pr-8 rounded-md text-sm bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/40 border border-primary-foreground/15 focus:outline-none focus:border-primary-foreground/30 focus:bg-primary-foreground/15 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-primary-foreground/50 hover:text-primary-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Right: Display mode toggle + undo/redo + user/settings */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Display mode toggle */}
            <div className="inline-flex h-8 items-center rounded-md bg-primary-foreground/10 border border-primary-foreground/15 p-0.5">
              {([
                { key: "hours" as DisplayMode, label: "Hodiny" },
                { key: "czk" as DisplayMode, label: "Hod + Kč" },
                { key: "percent" as DisplayMode, label: "%" },
              ]).map(m => (
                <button
                  key={m.key}
                  onClick={() => onDisplayModeChange(m.key)}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-xs font-medium transition-all ${
                    displayMode === m.key
                      ? "bg-primary-foreground text-primary shadow-sm"
                      : "text-primary-foreground/60 hover:text-primary-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-primary-foreground/15" />

            {/* Undo/Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => undo("plan-vyroby")}
                  disabled={!canUndo("plan-vyroby")}
                  className="p-1.5 rounded-md transition-colors disabled:opacity-30"
                  style={{ color: canUndo("plan-vyroby") ? "#ffffff" : "rgba(255,255,255,0.3)" }}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Zpět (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => redo("plan-vyroby")}
                  disabled={!canRedo("plan-vyroby")}
                  className="p-1.5 rounded-md transition-colors disabled:opacity-30"
                  style={{ color: canRedo("plan-vyroby") ? "#ffffff" : "rgba(255,255,255,0.3)" }}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Vpřed (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>

            <div className="w-px h-5 bg-primary-foreground/15" />

            <button
              onClick={() => navigate("/")}
              className="p-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Přehled projektů"
            >
              <LayoutDashboard className="h-4.5 w-4.5" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans text-xs">{profile?.full_name || profile?.email || "Uživatel"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setAccountSettingsOpen(true)}>
                  <UserCog className="h-4 w-4 mr-2" />
                  Nastavení účtu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="h-4 w-4 mr-2" />
                  Odhlásit se
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {(canAccessSettings || realRole === "owner") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                    <Settings className="h-4.5 w-4.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canManageUsers && (
                    <DropdownMenuItem onClick={() => setUserMgmtOpen(true)}>
                      Správa uživatelů
                    </DropdownMenuItem>
                  )}
                  {canManagePeople && (
                    <DropdownMenuItem onClick={openPeopleManagement}>
                      Správa osob
                    </DropdownMenuItem>
                  )}
                  {canManageExchangeRates && (
                    <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                      Kurzovní lístek
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCostPresetsOpen(true)}>
                      Rozpad ceny
                    </DropdownMenuItem>
                  )}
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setCapacitySettingsOpen(true)}>
                      📊 Kapacita výroby
                    </DropdownMenuItem>
                  )}
                  {canManageStatuses && (
                    <DropdownMenuItem onClick={() => setStatusMgmtOpen(true)}>
                      Správa statusů
                    </DropdownMenuItem>
                  )}
                  {canAccessRecycleBin && (
                    <DropdownMenuItem onClick={() => setRecycleBinOpen(true)}>
                      Koš
                    </DropdownMenuItem>
                  )}
                  {(isAdmin || role === "pm" || isOwner) && (
                    <DropdownMenuItem onClick={toggleDataLog}>
                      Data Log
                    </DropdownMenuItem>
                  )}
                  {realRole === "owner" && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                      {(["admin", "pm", "konstrukter", "viewer"] as const).map((r) => (
                        <DropdownMenuItem
                          key={r}
                          onClick={() => setSimulatedRole(r === "admin" ? null : r)}
                          className="flex items-center justify-between"
                        >
                          <span>{ROLE_LABELS[r]}</span>
                          {((r === "admin" && !simulatedRole) || simulatedRole === r) && (
                            <Check className="h-4 w-4 text-green-600" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {/* Settings dialogs */}
      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <DataLogPanel open={dataLogOpen} onOpenChange={setDataLogOpen} />
      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
    </>
  );
}
