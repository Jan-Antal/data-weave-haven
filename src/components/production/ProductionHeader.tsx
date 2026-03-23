import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { LayoutDashboard, Factory, CalendarRange, Settings, Check, User, UserCog, LogOut, Undo2, Redo2, Clock } from "lucide-react";
import { AdminInboxButton } from "@/components/AdminInbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserManagement } from "@/components/UserManagement";
import { AccountSettings } from "@/components/AccountSettings";
import { ExchangeRateSettings } from "@/components/ExchangeRateSettings";
import { StatusManagement } from "@/components/StatusManagement";
import { RecycleBin } from "@/components/RecycleBin";
import { CostBreakdownPresetsDialog } from "@/components/CostBreakdownPresetsDialog";
import { CapacitySettings } from "@/components/production/CapacitySettings";
import { cn } from "@/lib/utils";

type HeaderModule = "index" | "plan-vyroby" | "vyroba";

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
    profile,
    signOut,
  } = useAuth();
  const { openPeopleManagement } = usePeopleManagement();
  const { undo, redo, canUndo, canRedo, lastUndoDescription, lastRedoDescription } = useUndoRedo();

  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [exchangeRateOpen, setExchangeRateOpen] = useState(false);
  const [statusMgmtOpen, setStatusMgmtOpen] = useState(false);
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [costPresetsOpen, setCostPresetsOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [capacitySettingsOpen, setCapacitySettingsOpen] = useState(false);

  const undoPage = module === "index" ? undefined : module;
  const hasUndo = undoPage ? canUndo(undoPage) : canUndo();
  const hasRedo = undoPage ? canRedo(undoPage) : canRedo();
  const undoDesc = undoPage ? lastUndoDescription(undoPage) : lastUndoDescription();
  const redoDesc = undoPage ? lastRedoDescription(undoPage) : lastRedoDescription();
  const moduleLabel = module === "index" ? "Project Info 2026" : module === "vyroba" ? "Výroba" : "Plán Výroby";
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
                {hasUndo ? `Zpět: ${undoDesc}` : "Nic k vrácení"}
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
                {hasRedo ? `Obnovit: ${redoDesc}` : "Nic k obnovení"}
              </TooltipContent>
            </Tooltip>

            <span className="w-px h-5 bg-primary-foreground/20 mx-1" />

            {(isAdmin || isOwner) && (
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

            {(isAdmin || isOwner) && (
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

            <AdminInboxButton />

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

            {(canAccessSettings || realRole === "owner") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                    <Settings className="h-5 w-5" />
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
                      Kapacita výroby
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

      <UserManagement open={userMgmtOpen} onOpenChange={setUserMgmtOpen} />
      <ExchangeRateSettings open={exchangeRateOpen} onOpenChange={setExchangeRateOpen} />
      <StatusManagement open={statusMgmtOpen} onOpenChange={setStatusMgmtOpen} />
      <RecycleBin open={recycleBinOpen} onOpenChange={setRecycleBinOpen} />
      <AccountSettings open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen} />
      <CapacitySettings open={capacitySettingsOpen} onOpenChange={setCapacitySettingsOpen} />
      <CostBreakdownPresetsDialog open={costPresetsOpen} onOpenChange={setCostPresetsOpen} />
    </>
  );
}
