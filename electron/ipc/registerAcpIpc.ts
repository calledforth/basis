import { ipcMain } from "electron";
import { AcpManager } from "../acp/manager.js";
import { ChatDb } from "../core/chatDb.js";
import { addLog } from "../core/logs.js";
import { VaultService } from "../vault/service.js";
import type { EmitAcpEvent } from "./acp/shared.js";
import {
  emitSessionBootstrapEvents,
  ensureThreadSessionAndPersist,
  toAcpErrorPayload,
} from "./acp/shared.js";

type RegisterAcpIpcArgs = {
  acpManager: AcpManager;
  chatDb: ChatDb;
  vaultService: VaultService;
  emitAcpEvent: EmitAcpEvent;
};

export function registerAcpIpc(args: RegisterAcpIpcArgs) {
  ipcMain.handle("acp:start-session", async (_evt, payload: { spaceSlug: string; threadId: string }) => {
    const { spaceSlug, threadId } = payload;
    addLog({
      scope: "acp",
      level: "info",
      message: "ACP start-session requested",
      data: { spaceSlug, threadId }
    });

    const thread = args.chatDb.getThread(spaceSlug, threadId);
    if (!thread) throw new Error("Thread not found");

    try {
      const { ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });
      emitSessionBootstrapEvents({
        ensured,
        spaceSlug,
        threadId,
        emitAcpEvent: args.emitAcpEvent,
      });
      return { sessionId: ensured.sessionId, created: ensured.state === "created" };
    } catch (error) {
      args.chatDb.updateThread(spaceSlug, threadId, { status: "broken" });
      const message = error instanceof Error ? error.message : "Unknown ACP startup error";
      addLog({
        scope: "acp",
        level: "error",
        message: "Failed to start ACP session",
        data: { spaceSlug, threadId, backend: thread.backend, message }
      });
      args.emitAcpEvent(spaceSlug, threadId, "error", "rpc_error", toAcpErrorPayload(thread.backend, error, "bootstrap"));
      throw error;
    }
  });

  ipcMain.handle("acp:send-prompt", async (_evt, payload: { spaceSlug: string; threadId: string; prompt: string }) => {
    const { spaceSlug, threadId, prompt } = payload;
    addLog({
      scope: "acp",
      level: "info",
      message: "ACP send-prompt requested",
      data: { spaceSlug, threadId, promptPreview: prompt.slice(0, 120) }
    });
    if (!prompt.trim()) return false;

    const thread = args.chatDb.getThread(spaceSlug, threadId);
    if (!thread) throw new Error("Thread not found");

    try {
      const { ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });
      emitSessionBootstrapEvents({
        ensured,
        spaceSlug,
        threadId,
        emitAcpEvent: args.emitAcpEvent,
      });

      await args.acpManager.sendPromptQueued({
        backend: thread.backend,
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        sessionId: ensured.sessionId,
        prompt
      });

      args.chatDb.updateThread(spaceSlug, threadId, {
        lastMessagePreview: prompt.slice(0, 120),
        status: "ready"
      });
      return true;
    } catch (error) {
      args.chatDb.updateThread(spaceSlug, threadId, { status: "broken" });
      addLog({
        scope: "acp",
        level: "error",
        message: "Failed to send ACP prompt",
        data: { spaceSlug, threadId, backend: thread.backend, message: error instanceof Error ? error.message : String(error) }
      });
      args.emitAcpEvent(spaceSlug, threadId, "error", "rpc_error", toAcpErrorPayload(thread.backend, error, "prompt"));
      throw error;
    }
  });

  ipcMain.handle("acp:list-events", (_evt, payload: { spaceSlug: string; threadId: string }) => {
    return args.chatDb.listAcpEvents(payload.spaceSlug, payload.threadId);
  });

  ipcMain.handle(
    "acp:cancel-prompt",
    async (_evt, payload: { spaceSlug: string; threadId: string }) => {
      const { spaceSlug, threadId } = payload;
      const { thread, ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });

      await args.acpManager.cancelPrompt({
        backend: thread.backend,
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        sessionId: ensured.sessionId
      });
      return true;
    }
  );

  ipcMain.handle(
    "acp:respond-permission",
    (
      _evt,
      payload: {
        requestId: string;
        outcome: { outcome: "selected"; optionId: string } | { outcome: "cancelled" };
      }
    ) => {
      return args.acpManager.respondPermission(payload);
    }
  );

  ipcMain.handle(
    "acp:set-session-mode",
    async (_evt, payload: { spaceSlug: string; threadId: string; modeId: string }) => {
      const { spaceSlug, threadId, modeId } = payload;
      addLog({
        scope: "acp",
        level: "info",
        message: "ACP set-session-mode requested",
        data: { spaceSlug, threadId, modeId }
      });
      const thread = args.chatDb.getThread(spaceSlug, threadId);
      if (!thread) throw new Error("Thread not found");

      const { ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });

      await args.acpManager.setSessionMode({
        backend: thread.backend,
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        sessionId: ensured.sessionId,
        modeId
      });
      return true;
    }
  );

  ipcMain.handle(
    "acp:set-session-model",
    async (_evt, payload: { spaceSlug: string; threadId: string; modelId: string }) => {
      const { spaceSlug, threadId, modelId } = payload;
      addLog({
        scope: "acp",
        level: "info",
        message: "ACP set-session-model requested",
        data: { spaceSlug, threadId, modelId }
      });
      const thread = args.chatDb.getThread(spaceSlug, threadId);
      if (!thread) throw new Error("Thread not found");

      const { ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });

      await args.acpManager.setSessionModel({
        backend: thread.backend,
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        sessionId: ensured.sessionId,
        modelId
      });
      return true;
    }
  );

  ipcMain.handle(
    "acp:set-session-config-option",
    async (
      _evt,
      payload: {
        spaceSlug: string;
        threadId: string;
        configId: string;
        value?: string;
        booleanValue?: boolean;
      }
    ) => {
      const { spaceSlug, threadId, configId, value, booleanValue } = payload;
      addLog({
        scope: "acp",
        level: "info",
        message: "ACP set-session-config-option requested",
        data: { spaceSlug, threadId, configId, value, booleanValue }
      });
      const thread = args.chatDb.getThread(spaceSlug, threadId);
      if (!thread) throw new Error("Thread not found");

      const { ensured } = await ensureThreadSessionAndPersist({
        acpManager: args.acpManager,
        chatDb: args.chatDb,
        vaultService: args.vaultService,
        spaceSlug,
        threadId,
      });

      await args.acpManager.setSessionConfigOption({
        backend: thread.backend,
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        sessionId: ensured.sessionId,
        configId,
        value,
        booleanValue
      });
      return true;
    }
  );
}
