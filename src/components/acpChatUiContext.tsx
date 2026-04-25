import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AcpPermissionResponseOutcome } from "../types";

export const ACP_CHAT_DISMISS_POPOVERS_EVENT = "basis:acp-chat-dismiss-popovers";

export type AcpChatUiContextValue = {
  spaceRoot: string;
  onOpenFile: (relPath: string) => void;
  settledPermissions: Set<string>;
  onPermissionRespond: (requestId: string, outcome: AcpPermissionResponseOutcome) => Promise<void>;
  dismissPopovers: () => void;
};

const Ctx = createContext<AcpChatUiContextValue | null>(null);

export function AcpChatUiProvider({
  value,
  children
}: {
  value: AcpChatUiContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAcpChatUi(): AcpChatUiContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAcpChatUi must be used within AcpChatUiProvider");
  return v;
}
