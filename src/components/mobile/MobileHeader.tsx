import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, Menu, UserCog, LogOut, BarChart3, Home } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { AccountSettings } from "@/components/AccountSettings";

const ROLE_LABELS: Record<string, string> = {
  owner: "Vlastník",
  admin: "Admin",
  pm: "Projektový manažer",
  konstrukter: "Konstruktér",
  viewer: "Čtenář",
};

interface MobileHeaderProps {
  onDataLog?: () => void;
  showDataLog?: boolean;
}

export function MobileHeader({ onDataLog, showDataLog = false }: MobileHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user, profile, role, signOut } = useAuth();

  return (
    <>
      <header
        className="md:hidden border-b bg-primary px-4 pb-3 shrink-0 z-50"
        style={{ paddingTop: "max(env(safe-area-inset-top, 0px), 12px)" }}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-serif text-primary-foreground tracking-wide">
            A→M <span className="font-sans font-normal text-sm opacity-80">Interior</span>
          </h1>
          <button
            onClick={() => setMenuOpen(true)}
            className="p-2 rounded-md text-primary-foreground/70 hover:text-primary-foreground min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[280px] p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <div className="p-5 border-b border-border">
            <p className="font-medium text-sm text-foreground">{profile?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {ROLE_LABELS[role || ""] || role}
            </p>
          </div>
          <div className="py-2">
            {showDataLog && onDataLog && (
              <button
                onClick={() => { setMenuOpen(false); onDataLog(); }}
                className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px]"
              >
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <span>Data Log</span>
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); setAccountOpen(true); }}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px]"
            >
              <UserCog className="h-4 w-4 text-muted-foreground" />
              <span>Nastavení účtu</span>
            </button>
            <button
              onClick={() => { setMenuOpen(false); signOut(); }}
              className="flex items-center gap-3 w-full px-5 py-3 text-sm hover:bg-accent min-h-[44px] text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Odhlásit se</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <AccountSettings open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  );
}
