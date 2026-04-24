import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { LayoutDashboard, Factory, CalendarRange, Settings, Check, User, UserCog, LogOut, Undo2, Redo2, Clock, Bell, BarChart3, ClipboardCheck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationPanel } from "@/components/NotificationPanel";
import { useNotifications } from "@/hooks/useNotifications";
import { AdminInboxButton } from "@/components/AdminInbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABELS as ALL_ROLE_LABELS } from "@/lib/permissionPresets";
import type { AppRole } from "@/hooks/useAuth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserManagement } from "@/components/UserManagement";
import { AccountSettings } from "@/components/AccountSettings";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { OverheadProjectsSettings } from "@/components/OverheadProjectsSettings";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { CapacitySettings } from "@/components/production/CapacitySettings";
import { FormulaBuilder } from "@/components/settings/FormulaBuilder";
import { cn } from "@/lib/utils";

type HeaderModule = "index" | "plan-vyroby" | "vyroba" | "analytics" | "osoby" | "tpv";

interface ProductionHeaderProps {
  module?: HeaderModule;
  forecastActive?: boolean;
  dataLogOpen?: boolean;
  onToggleDataLog?: () => void;
  onOpenVyrobaReset?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  vyroba: "Výroba",
  viewer: "Viewer",
};

function AnimatedTitle({ title }: { title: string }) {
  const [displayed, setDisplayed] = useState(title);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (title === displayed) return;
    setAnimating(true);
    const t = setTimeout(() => {
      setDisplayed(title);
      setAnimating(false);
    }, 200);
    return () => clearTimeout(t);
  }, [title]);

  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        opacity: animating ? 0 : 1,
        transform: animating ? "translateY(6px)" : "translateY(0px)",
        transition: "opacity 200ms ease, transform 200ms ease",
      }}
    >
      {displayed}
    </span>
  );
}

function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-semibold px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="p-0 w-auto border-0 shadow-none bg-transparent">
        <NotificationPanel onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

export function ProductionHeader({
  module = "plan-vyroby",
  forecastActive,
  dataLogOpen,
  onToggleDataLog,
  onOpenVyrobaReset,
}: ProductionHeaderProps) {
  const navigate = useNavigate();
  const {
    canAccessSettings,
    isAdmin,
    isOwner,
    realRole,
    simulatedRole,
    setSimulatedRole,
    role,
    canManageUsers,
    canManagePeople,
    canManageExchangeRates,
    canManageStatuses,
    canAccessRecycleBin,
    canManageOverheadProjects,
    canAccessPlanVyroby,
    canAccessAnalytics,
    canManageProduction,
    canQCOnly,
    profile,
    signOut,
  } = useAuth();

  const canSeeVyroba = canManageProduction || canQCOnly || isAdmin || isOwner;
  const canSeePlanVyroby = canAccessPlanVyroby || isAdmin || isOwner;
  const canSeeAnalytics = canAccessAnalytics || isAdmin || isOwner;
  const canSeeTpv = isAdmin || isOwner || role === "pm" || role === "konstrukter";
  const canOpenSettingsMenu =
    canAccessSettings ||
    canManageUsers ||
    canManagePeople ||
    canManageExchangeRates ||
    canManageStatuses ||
    canAccessRecycleBin ||
    canManageOverheadProjects ||
    isOwner;
  const { openPeopleManagement } = usePeopleManagement();
  const { undo, redo, canUndo, canRedo, lastUndoDescription, lastRedoDescription } = useUndoRedo();

  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [overheadOpen, setOverheadOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);
  const [formulaBuilderOpen, setFormulaBuilderOpen] = useState(false);

  const undoPage = (module === "index" || module === "analytics" || module === "osoby") ? undefined : module;
  const hasUndo = undoPage ? canUndo(undoPage) : canUndo();
  const hasRedo = undoPage ? canRedo(undoPage) : canRedo();
  const undoDesc = undoPage ? lastUndoDescription(undoPage) : lastUndoDescription();
  const redoDesc = undoPage ? lastRedoDescription(undoPage) : lastRedoDescription();
  const moduleLabel = module === "index" ? "Project Info 2026" : module === "vyroba" ? "Výroba" : module === "analytics" ? "Analytics" : module === "osoby" ? "Správa osob" : module === "tpv" ? "TPV — Príprava výroby" : "Plán Výroby";
  const showDataLog = module === "index"
    ? canAccessSettings || realRole === "owner" || role === "pm"
    : isAdmin || role === "pm" || isOwner;

  return (
    <>
      <header className="hidden md:block border-b bg-primary px-6 py-4 shrink-0 z-50" style={forecastActive ? { borderColor: "#2a3d3a" } : undefined}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <img
              src="/images/AM-Interior-orange.svg"
              alt="AM Interior"
              width="160"
              height="22"
              style={{ height: '22px', width: 'auto', display: 'block', flexShrink: 0 }}
              fetchPriority="high"
            />
            <span className="text-primary-foreground/40 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans"><AnimatedTitle title={moduleLabel} /></span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => (undoPage ? undo(undoPage) : undo())}
                  disabled={!hasUndo}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {hasUndo ? `Krok späť: ${undoDesc}` : "Nic k vrácení"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => (undoPage ? redo(undoPage) : redo())}
                  disabled={!hasRedo}
                  className="p-2 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {hasRedo ? `Krok dopredu: ${redoDesc}` : "Nic k obnovení"}
              </TooltipContent>
            </Tooltip>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1" />

            {canSeeVyroba && (
              <button
                onClick={module === "vyroba" ? undefined : () => navigate("/vyroba")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  module === "vyroba"
                    ? "text-primary-foreground bg-primary-foreground/10 cursor-default"
                    : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                )}
                title="Výroba"
              >
                <Factory className="h-5 w-5" />
              </button>
            )}

            {canSeePlanVyroby && (
              <button
                onClick={module === "plan-vyroby" ? undefined : () => navigate("/plan-vyroby")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  module === "plan-vyroby"
                    ? "text-primary-foreground bg-primary-foreground/10 cursor-default"
                    : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                )}
                title="Plán Výroby"
              >
                <CalendarRange className="h-5 w-5" />
              </button>
            )}

            {canSeeTpv && (
              <button
                onClick={module === "tpv" ? undefined : () => navigate("/tpv")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  module === "tpv"
                    ? "text-primary-foreground bg-primary-foreground/10 cursor-default"
                    : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                )}
                title="TPV — Príprava výroby"
              >
                <ClipboardCheck className="h-5 w-5" />
              </button>
            )}

            {canSeeAnalytics && (
              <button
                onClick={module === "analytics" ? undefined : () => navigate("/analytics")}
                className={cn(
                  "p-2 rounded-md transition-colors",
                  module === "analytics"
                    ? "text-primary-foreground bg-primary-foreground/10 cursor-default"
                    : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                )}
                title="Analytics — Výroba"
              >
                <BarChart3 className="h-5 w-5" />
              </button>
            )}

            <button
              onClick={module === "index" ? undefined : () => navigate("/")}
              className={cn(
                "p-2 rounded-md transition-colors",
                module === "index"
                  ? "text-primary-foreground bg-primary-foreground/10 cursor-default"
                  : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
              )}
              title="Přehled projektů"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>

            {onToggleDataLog && showDataLog && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleDataLog}
                    className={cn(
                      "p-2 rounded-md transition-colors",
                      dataLogOpen
                        ? "text-primary-foreground bg-primary-foreground/10"
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                    title="Data Log"
                  >
                    <Clock className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Data Log</TooltipContent>
              </Tooltip>
            )}

            <NotificationBell />

            

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors text-sm">
                  <User className="h-4 w-4" />
                  <span className="font-sans">{profile?.full_name || profile?.email || "Uživatel"}</span>
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

            {canOpenSettingsMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "p-2 rounded-md transition-colors",
                      module === "osoby"
                        ? "text-primary-foreground bg-primary-foreground/10"
                        : "text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10"
                    )}
                  >
                    <Settings className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(canManageUsers || canManagePeople) && (
                    <DropdownMenuItem onClick={() => navigate('/osoby')}>
                      Správa osob
                    </DropdownMenuItem>
                  )}
                  {canManageExchangeRates && (
                    <DropdownMenuItem onClick={() => setExchangeRateOpen(true)}>
                      Kurzovní lístek
                    </DropdownMenuItem>
                  )}
                  {canAccessSettings && (
                    <DropdownMenuItem onClick={() => setCostPresetsOpen(true)}>
                      Rozpad ceny
                    </DropdownMenuItem>
                  )}
                  {canManageOverheadProjects && (
                    <DropdownMenuItem onClick={() => setOverheadOpen(true)}>
                      Režijní projekty
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
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setFormulaBuilderOpen(true)}>
                      Výpočetní logika
                    </DropdownMenuItem>
                  )}
                  {module === "vyroba" && isAdmin && onOpenVyrobaReset && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onOpenVyrobaReset} className="text-destructive">
                        🗑️ Reset dát výroby
                      </DropdownMenuItem>
                    </>
                  )}
                  {realRole === "owner" && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Zobrazit jako</div>
                      <div className="px-2 pb-2 pt-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <Select
                          value={simulatedRole ?? "__real__"}
                          onValueChange={(v) => setSimulatedRole(v === "__real__" ? null : (v as AppRole))}
                        >
                          <SelectTrigger className="h-8 w-full text-xs">
                            <SelectValue placeholder="Vlastná rola" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__real__" className="text-xs">
                              Vlastná rola (Owner)
                            </SelectItem>
                            {(Object.keys(ALL_ROLE_LABELS) as AppRole[])
                              .filter((r) => r !== "owner")
                              .map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {ALL_ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <OverheadProjectsSettings open={overheadOpen} onOpenChange={setOverheadOpen} />
      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
      <CostBreakdownPresetsDialog open={costPresetsOpen} onOpenChange={setCostPresetsOpen} />
      <FormulaBuilder open={formulaBuilderOpen} onOpenChange={setFormulaBuilderOpen} />
    </>
  );
}
