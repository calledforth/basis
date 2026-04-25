import { contextBridge, ipcRenderer } from "electron";

const api = {
  win: {
    minimize: () => ipcRenderer.invoke("win:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("win:toggle-maximize"),
    close: () => ipcRenderer.invoke("win:close"),
    isMaximized: () => ipcRenderer.invoke("win:is-maximized") as Promise<boolean>,
    onMaximized: (cb: (maximized: boolean) => void) => {
      const listener = (_: Electron.IpcRendererEvent, maximized: boolean) => cb(maximized);
      ipcRenderer.on("win:maximized", listener);
      return () => ipcRenderer.removeListener("win:maximized", listener);
    }
  },
  config: {
    get: () => ipcRenderer.invoke("config:get")
  },
  prefs: {
    getApp: () => ipcRenderer.invoke("prefs:get-app"),
    setApp: (patch: Record<string, unknown>) => ipcRenderer.invoke("prefs:set-app", patch),
    getSpaceWorkspace: (slug: string) => ipcRenderer.invoke("prefs:get-space-workspace", slug),
    setSpaceWorkspace: (slug: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke("prefs:set-space-workspace", slug, patch)
  },
  vault: {
    pick: () => ipcRenderer.invoke("vault:pick"),
    set: (vaultPath: string) => ipcRenderer.invoke("vault:set", vaultPath)
  },
  spaces: {
    list: () => ipcRenderer.invoke("spaces:list"),
    create: (title?: string) => ipcRenderer.invoke("spaces:create", title),
    setLastAccessed: (slug: string) => ipcRenderer.invoke("spaces:set-last-accessed", slug),
    rename: (slug: string, newTitle: string) => ipcRenderer.invoke("spaces:rename", slug, newTitle),
    delete: (slug: string) => ipcRenderer.invoke("spaces:delete", slug)
  },
  files: {
    tree: (spaceSlug: string) => ipcRenderer.invoke("space:file-tree", spaceSlug),
    read: (spaceSlug: string, relPath: string) => ipcRenderer.invoke("space:file-read", spaceSlug, relPath),
    write: (spaceSlug: string, relPath: string, content: string) =>
      ipcRenderer.invoke("space:file-write", spaceSlug, relPath, content)
  },
  threads: {
    list: (spaceSlug: string) => ipcRenderer.invoke("threads:list", spaceSlug),
    create: (spaceSlug: string, opts?: { title?: string; backend?: "cursor" | "opencode" }) =>
      ipcRenderer.invoke("threads:new", spaceSlug, opts),
    update: (spaceSlug: string, threadId: string, patch: Record<string, unknown>) =>
      ipcRenderer.invoke("threads:update", spaceSlug, threadId, patch)
  },
  acp: {
    startSession: (args: { spaceSlug: string; threadId: string }) => ipcRenderer.invoke("acp:start-session", args),
    sendPrompt: (args: { spaceSlug: string; threadId: string; prompt: string }) =>
      ipcRenderer.invoke("acp:send-prompt", args),
    cancelPrompt: (args: { spaceSlug: string; threadId: string }) =>
      ipcRenderer.invoke("acp:cancel-prompt", args),
    listEvents: (args: { spaceSlug: string; threadId: string }) => ipcRenderer.invoke("acp:list-events", args),
    setSessionMode: (args: { spaceSlug: string; threadId: string; modeId: string }) =>
      ipcRenderer.invoke("acp:set-session-mode", args),
    setSessionModel: (args: { spaceSlug: string; threadId: string; modelId: string }) =>
      ipcRenderer.invoke("acp:set-session-model", args),
    setSessionConfigOption: (args: {
      spaceSlug: string;
      threadId: string;
      configId: string;
      value?: string;
      booleanValue?: boolean;
    }) => ipcRenderer.invoke("acp:set-session-config-option", args),
    respondPermission: (args: {
      requestId: string;
      outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
    }) => ipcRenderer.invoke("acp:respond-permission", args)
  },
  logs: {
    list: () => ipcRenderer.invoke("logs:list"),
    clear: () => ipcRenderer.invoke("logs:clear")
  },
  events: {
    onVaultFileChanged: (cb: (payload: unknown) => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
      ipcRenderer.on("vault:file-changed", listener);
      return () => ipcRenderer.removeListener("vault:file-changed", listener);
    },
    onAcpEvent: (cb: (payload: unknown) => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
      ipcRenderer.on("acp:event", listener);
      return () => ipcRenderer.removeListener("acp:event", listener);
    },
    onLogEntry: (cb: (payload: unknown) => void) => {
      const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload);
      ipcRenderer.on("logs:entry", listener);
      return () => ipcRenderer.removeListener("logs:entry", listener);
    }
  }
};

contextBridge.exposeInMainWorld("basis", api);
