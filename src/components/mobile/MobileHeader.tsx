import { useState } from "react";
import { Menu, LogOut, UserCog, Check, Users, DollarSign, Tag, Trash2, BarChart3, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

interface MobileHeaderProps {
  profileName: string;
  profileEmail?: string;
  profileRole?: string | null;
  isAdmin: boolean;
  isOwner: boolean;
  realRole: string | null;
  simulatedRole: string | null;
  setSimulatedRole: (r: string | null) => void;
  canAccessSettings: boolean;
  onSignOut: () => void;
  onAccountSettings: () => void;
  onSettings: () => void;
  // Admin menu callbacks
  canManageUsers?: boolean;
  canManagePeople?: boolean;
  canManageExchangeRates?: boolean;
  canManageStatuses?: boolean;
  canAccessRecycleBin?: boolean;
  onUserMgmt?: () => void;
  onPeopleMgmt?: () => void;
  onExchangeRates?: () => void;
  onStatusMgmt?: () => void;
  onRecycleBin?: () => void;
  onDataLog?: () => void;
}

export function MobileHeader({
  profileName,
  profileEmail,
  profileRole,
  isAdmin,
  isOwner,
  realRole,
  simulatedRole,
  setSimulatedRole,
  canAccessSettings,
  onSignOut,
  onAccountSettings,
  canManageUsers,
  canManagePeople,
  canManageExchangeRates,
  canManageStatuses,
  canAccessRecycleBin,
  onUserMgmt,
  onPeopleMgmt,
  onExchangeRates,
  onStatusMgmt,
  onRecycleBin,
  onDataLog,
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <header className="md:hidden border-b bg-primary px-4 pb-3 shrink-0 z-50"
      style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-serif text-primary-foreground tracking-wide">
          A→M <span className="font-sans font-normal text-sm opacity-80">Interior</span>
        </h1>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground min-w-[44px] min-h-[44px] flex items-center justify-center">
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[280px] p-0">
            <div className="flex flex-col h-full">
              {/* Header with user info */}
              <div className="p-4 border-b bg-primary">
                <p className="text-primary-foreground font-medium">{profileName}</p>
                {profileEmail && <p className="text-primary-foreground/60 text-sm">{profileEmail}</p>}
                {profileRole && <p className="text-primary-foreground/40 text-xs mt-0.5">{ROLE_LABELS[profileRole] || profileRole}</p>}
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {/* Account settings */}
                <button
                  onClick={() => { onAccountSettings(); setOpen(false); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]"
                >
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  Nastavení účtu
                </button>

                {/* Admin/settings section */}
                {(canManageUsers || canManagePeople || canManageExchangeRates || canManageStatuses || canAccessRecycleBin || isAdmin || profileRole === "pm" || isOwner) && (
                  <div className="border-t mt-2 pt-2">
                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Správa</p>
                    {canManageUsers && (
                      <button onClick={() => { setOpen(false); onUserMgmt?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Správa uživatelů
                      </button>
                    )}
                    {canManagePeople && (
                      <button onClick={() => { setOpen(false); onPeopleMgmt?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <UserCog className="h-4 w-4 text-muted-foreground" />
                        Správa osob
                      </button>
                    )}
                    {canManageExchangeRates && (
                      <button onClick={() => { setOpen(false); onExchangeRates?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        Kurzovní lístek
                      </button>
                    )}
                    {canManageStatuses && (
                      <button onClick={() => { setOpen(false); onStatusMgmt?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        Správa statusů
                      </button>
                    )}
                    {canAccessRecycleBin && (
                      <button onClick={() => { setOpen(false); onRecycleBin?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                        Koš
                      </button>
                    )}
                    {(isAdmin || profileRole === "pm" || isOwner) && (
                      <button onClick={() => { setOpen(false); onDataLog?.(); }} className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]">
                        <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        Data Log
                      </button>
                    )}
                  </div>
                )}

                {/* Role switcher */}
                {realRole === "owner" && (
                  <div className="border-t mt-2 pt-2">
                    <div className="flex items-center gap-2 px-3 py-1 text-xs font-medium text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      Zobrazit jako
                    </div>
                    {(["admin", "pm", "konstrukter", "viewer"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => { setSimulatedRole(r === "admin" ? null : r); setOpen(false); }}
                        className="flex items-center justify-between w-full px-3 py-2.5 rounded-md hover:bg-accent text-sm min-h-[44px]"
                      >
                        <span>{ROLE_LABELS[r]}</span>
                        {((r === "admin" && !simulatedRole) || simulatedRole === r) && (
                          <Check className="h-4 w-4 text-green-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sign out at bottom */}
              <div className="border-t p-2">
                <button
                  onClick={() => { onSignOut(); setOpen(false); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm text-destructive min-h-[44px]"
                >
                  <LogOut className="h-4 w-4" />
                  Odhlásit se
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
