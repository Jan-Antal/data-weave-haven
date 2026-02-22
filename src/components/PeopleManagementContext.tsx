import { createContext, useContext, useState, ReactNode } from "react";
import { PeopleManagement } from "./PeopleManagement";

interface PeopleManagementContextType {
  openPeopleManagement: () => void;
}

const PeopleManagementContext = createContext<PeopleManagementContextType>({
  openPeopleManagement: () => {},
});

export function usePeopleManagement() {
  return useContext(PeopleManagementContext);
}

export function PeopleManagementProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <PeopleManagementContext.Provider value={{ openPeopleManagement: () => setOpen(true) }}>
      {children}
      <PeopleManagement open={open} onOpenChange={setOpen} />
    </PeopleManagementContext.Provider>
  );
}
