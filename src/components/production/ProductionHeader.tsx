import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useProductionSettings } from "@/hooks/useProductionSettings";
import { useProductionSchedule } from "@/hooks/useProductionSchedule";
import { useProductionInbox } from "@/hooks/useProductionInbox";
import { useAuth } from "@/hooks/useAuth";
import { usePeopleManagement } from "@/components/PeopleManagementContext";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import { LayoutDashboard, Settings, Check, User, UserCog, LogOut, Undo2, Redo2 } from "lucide-react";
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
}

export function ProductionHeader({ displayMode, onDisplayModeChange }: ProductionHeaderProps) {
  const navigate = useNavigate();
  const { data: settings } = useProductionSettings();
  const { data: scheduleData } = useProductionSchedule();
  const { data: inboxProjects = [] } = useProductionInbox();
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

  const toggleDataLog = useCallback(() => setDataLogOpen((p) => !p), []);

  const monthlyHours = settings?.monthly_capacity_hours ?? 3500;
  const hourlyRate = settings?.hourly_rate ?? 550;
  const monthlyCzk = monthlyHours * hourlyRate;

  const scheduledHours = scheduleData
    ? Array.from(scheduleData.values()).reduce((s, w) => s + w.total_hours, 0)
    : 0;

  const inboxHours = inboxProjects.reduce((s, p) => s + p.total_hours, 0);
  const isOverCapacity = scheduledHours > monthlyHours;

  const formatCzk = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M Kč`;
    if (v >= 1_000) return `${Math.round(v / 1_000)}K Kč`;
    return `${v.toLocaleString("cs-CZ")} Kč`;
  };

  return (
    <>
      <header className="border-b bg-primary px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          {/* Left: Logo + View Tabs */}
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-xl font-serif text-primary-foreground tracking-wide">
              A→M <span className="font-sans font-normal text-base opacity-80">Interior</span>
            </h1>
            <span className="text-primary-foreground/30 text-sm">|</span>
            <span className="text-primary-foreground/70 text-sm font-sans font-medium">Plán Výroby</span>
          </div>

          {/* Center: Stats */}
          <div className="flex items-center gap-0">
            <StatBox label="Kapacita / měsíc" value={`${monthlyHours.toLocaleString("cs-CZ")} h`} />
            <Divider />
            <StatBox label="CZK ekvivalent" value={formatCzk(monthlyCzk)} />
            <Divider />
            <StatBox
              label="Naplánováno"
              value={`${Math.round(scheduledHours).toLocaleString("cs-CZ")} h`}
              valueColor={isOverCapacity ? "#fca5a5" : "#a7d9a2"}
            />
            <Divider />
            <StatBox
              label="V Inboxu"
              value={`${Math.round(inboxHours).toLocaleString("cs-CZ")} h`}
              valueColor="#fcd34d"
            />
          </div>

          {/* Right: Back icon + User menu + Settings gear */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Undo/Redo buttons */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => undo("plan-vyroby")}
                  disabled={!canUndo("plan-vyroby")}
                  className="p-2 rounded-md transition-colors disabled:opacity-30"
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
                  className="p-2 rounded-md transition-colors disabled:opacity-30"
                  style={{ color: canRedo("plan-vyroby") ? "#ffffff" : "rgba(255,255,255,0.3)" }}
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Vpřed (Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
            <div className="w-px h-5 bg-primary-foreground/15 mx-1" />

            <button
              onClick={() => navigate("/")}
              className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
              title="Přehled projektů"
            >
              <LayoutDashboard className="h-5 w-5" />
            </button>

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
    </>
  );
}

function StatBox({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="px-3.5 text-center">
      <div className="text-[8px] uppercase tracking-[0.08em] font-medium text-primary-foreground/40">
        {label}
      </div>
      <div
        className="font-mono font-semibold text-[13px] leading-tight"
        style={{ color: valueColor || "rgba(255,255,255,0.9)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-primary-foreground/15" />;
}
