import { createContext, useContext, useState, ReactNode } from "react";
import { SpravaOsob, type SpravaOsobTab } from "./SpravaOsob";

interface PeopleManagementContextType {
  openPeopleManagement: (tab?: SpravaOsobTab) => void;
}

const PeopleManagementContext = createContext<PeopleManagementContextType>({
  openPeopleManagement: () => {},
});

export function usePeopleManagement() {
  return useContext(PeopleManagementContext);
}

export function PeopleManagementProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [defaultTab, setDefaultTab] = useState<SpravaOsobTab>("zamestnanci");

  return (
    <PeopleManagementContext.Provider
      value={{
        openPeopleManagement: (tab = "externisti") => {
          setDefaultTab(tab);
          setOpen(true);
        },
      }}
    >
      {children}
      <SpravaOsob open={open} onOpenChange={setOpen} defaultTab={defaultTab} />
    </PeopleManagementContext.Provider>
  );
}
