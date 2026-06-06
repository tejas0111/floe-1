import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type DashboardStateValue = {
  ownerFilter: string;
  chainFilter: string;
  focusedFileId: string | null;
  latestUploadFileId: string | null;
  latestUploadOwner: string;
  latestUploadChain: string;
  setOwnerFilter: (value: string) => void;
  setChainFilter: (value: string) => void;
  focusUpload: (fileId: string, owner: string, chain: string) => void;
  clearFocus: () => void;
};

const DashboardStateContext = createContext<DashboardStateValue | null>(null);

export function DashboardStateProvider({ children }: { children: ReactNode }) {
  const [ownerFilter, setOwnerFilter] = useState("");
  const [chainFilter, setChainFilter] = useState("");
  const [focusedFileId, setFocusedFileId] = useState<string | null>(null);
  const [latestUploadFileId, setLatestUploadFileId] = useState<string | null>(null);
  const [latestUploadOwner, setLatestUploadOwner] = useState("");
  const [latestUploadChain, setLatestUploadChain] = useState("");

  const focusUpload = useCallback((fileId: string, owner: string, chain: string) => {
    setFocusedFileId(fileId);
    setLatestUploadFileId(fileId);
    setLatestUploadOwner(owner);
    setLatestUploadChain(chain);
    setOwnerFilter(owner);
    setChainFilter(chain);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedFileId(null);
  }, []);

  const value = useMemo<DashboardStateValue>(
    () => ({
      ownerFilter,
      chainFilter,
      focusedFileId,
      latestUploadFileId,
      latestUploadOwner,
      latestUploadChain,
      setOwnerFilter,
      setChainFilter,
      focusUpload,
      clearFocus,
    }),
    [
      ownerFilter,
      chainFilter,
      focusedFileId,
      latestUploadFileId,
      latestUploadOwner,
      latestUploadChain,
      focusUpload,
      clearFocus,
    ]
  );

  return <DashboardStateContext.Provider value={value}>{children}</DashboardStateContext.Provider>;
}

export function useDashboardState() {
  const value = useContext(DashboardStateContext);
  if (!value) {
    throw new Error("useDashboardState must be used within DashboardStateProvider");
  }
  return value;
}
