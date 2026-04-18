import { createContext, useContext, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

export type SpravaOsobTab = "zamestnanci" | "externisti" | "uzivatele" | "katalog" | "kapacita";

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
  const navigate = useNavigate();

  return (
    <PeopleManagementContext.Provider
      value={{
        openPeopleManagement: (tab = "externisti") => {
          navigate(`/osoby?tab=${tab}`);
        },
      }}
    >
      {children}
    </PeopleManagementContext.Provider>
  );
}
