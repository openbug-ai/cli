import React, {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useState,
} from "react";
import { manageState } from "../utils/types.js";

type manageStateContextProps = {
  state: manageState;
  update: (patch: Partial<manageState>) => void;
  value: string;
  setValue: Dispatch<SetStateAction<string>>;
};

const ManageStateContext = createContext<manageStateContextProps | null>(null);

export const ManageStateProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<manageState>({
    hasStarted: false,
    apiKeyVerified: false,
    connectService: false,
    // serviceConnected: false,
    showRuntimeOutput: false,
  });
  const [value, setValue] = useState("");

  return (
    <ManageStateContext.Provider
      value={{
        state,
        update: (patch) => setState((prev) => ({ ...prev, ...patch })),
        value,
        setValue,
      }}
    >
      {children}
    </ManageStateContext.Provider>
  );
};

export const useManageState = () => {
  const ctx = useContext(ManageStateContext);
  if (!ctx)
    throw new Error("manage steps must be inside manage state provider");
  return ctx;
};
