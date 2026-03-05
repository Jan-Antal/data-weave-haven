import { useState } from "react";
import { Menu, X, LogOut, UserCog, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  pm: "PM",
  konstrukter: "Konstruktér",
  viewer: "Viewer",
};

interface MobileHeaderProps {
  profileName: string;
  isAdmin: boolean;
  isOwner: boolean;
  realRole: string | null;
  simulatedRole: string | null;
  setSimulatedRole: (r: string | null) => void;
  canAccessSettings: boolean;
  onSignOut: () => void;
  onAccountSettings: () => void;
  onSettings: () => void;
}

export function MobileHeader({
  profileName,
  isAdmin,
  isOwner,
  realRole,
  simulatedRole,
  setSimulatedRole,
  canAccessSettings,
  onSignOut,
  onAccountSettings,
  onSettings,
}: MobileHeaderProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

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
              <div className="p-4 border-b bg-primary">
                <p className="text-primary-foreground font-medium">{profileName}</p>
                <p className="text-primary-foreground/60 text-sm">AMI Interior</p>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <button
                  onClick={() => { onAccountSettings(); setOpen(false); }}
                  className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]"
                >
                  <UserCog className="h-4 w-4" />
                  Nastavení účtu
                </button>
                {canAccessSettings && (
                  <button
                    onClick={() => { onSettings(); setOpen(false); }}
                    className="flex items-center gap-3 w-full px-3 py-3 rounded-md hover:bg-accent text-sm min-h-[44px]"
                  >
                    Nastavení systému
                  </button>
                )}
                {realRole === "owner" && (
                  <div className="border-t mt-2 pt-2">
                    <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Zobrazit jako</p>
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
