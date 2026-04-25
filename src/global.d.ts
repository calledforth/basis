import type {
  AcpPermissionResponseOutcome,
  AcpTranslatedEvent,
  AppLogEntry,
  AppPrefs,
  FileNode,
  SpaceListItem,
  SpaceWorkspaceUi,
  ThreadRecord
} from "./types";

declare global {
  interface Window {
    basis: {
      win?: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        onMaximized: (cb: (maximized: boolean) => void) => () => void;
      };
      config: {
        get: () => Promise<{ vaultPath?: string }>;
      };
      prefs: {
        getApp: () => Promise<AppPrefs>;
        setApp: (patch: Partial<AppPrefs>) => Promise<boolean>;
        getSpaceWorkspace: (slug: string) => Promise<SpaceWorkspaceUi | undefined>;
        setSpaceWorkspace: (slug: string, patch: Partial<SpaceWorkspaceUi>) => Promise<boolean>;
      };
      vault: {
        pick: () => Promise<string | null>;
        set: (vaultPath: string) => Promise<boolean>;
      };
      spaces: {
        list: () => Promise<SpaceListItem[]>;
        create: (title?: string) => Promise<{ slug: string; overviewPath: string }>;
        setLastAccessed: (slug: string) => Promise<boolean>;
        rename: (slug: string, newTitle: string) => Promise<boolean>;
        delete: (slug: string) => Promise<boolean>;
      };
      files: {
        tree: (spaceSlug: string) => Promise<FileNode[]>;
        read: (spaceSlug: string, relPath: string) => Promise<string>;
        write: (spaceSlug: string, relPath: string, content: string) => Promise<boolean>;
      };
      threads: {
        list: (spaceSlug: string) => Promise<ThreadRecord[]>;
        create: (spaceSlug: string, opts?: { title?: string; backend?: "cursor" | "opencode" }) => Promise<ThreadRecord>;
        update: (spaceSlug: string, threadId: string, patch: Record<string, unknown>) => Promise<boolean>;
      };
      acp: {
        startSession: (args: { spaceSlug: string; threadId: string }) => Promise<{ sessionId: string; created: boolean }>;
        sendPrompt: (args: { spaceSlug: string; threadId: string; prompt: string }) => Promise<boolean>;
        cancelPrompt: (args: { spaceSlug: string; threadId: string }) => Promise<boolean>;
        listEvents: (args: { spaceSlug: string; threadId: string }) => Promise<AcpTranslatedEvent[]>;
        setSessionMode: (args: { spaceSlug: string; threadId: string; modeId: string }) => Promise<boolean>;
        setSessionModel: (args: { spaceSlug: string; threadId: string; modelId: string }) => Promise<boolean>;
        setSessionConfigOption: (args: {
          spaceSlug: string;
          threadId: string;
          configId: string;
          value?: string;
          booleanValue?: boolean;
        }) => Promise<boolean>;
        respondPermission: (args: { requestId: string; outcome: AcpPermissionResponseOutcome }) => Promise<boolean>;
      };
      logs: {
        list: () => Promise<AppLogEntry[]>;
        clear: () => Promise<boolean>;
      };
      events: {
        onVaultFileChanged: (cb: (payload: unknown) => void) => () => void;
        onAcpEvent: (cb: (payload: AcpTranslatedEvent) => void) => () => void;
        onLogEntry: (cb: (payload: unknown) => void) => () => void;
      };
    };
  }
}

export {};
