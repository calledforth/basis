import { ipcMain } from "electron";
import { AcpManager } from "../acp/manager.js";
import { ChatDb } from "../core/chatDb.js";
import { addLog } from "../core/logs.js";
import { VaultService } from "../vault/service.js";

type RegisterAcpIpcArgs = {
  acpManager: AcpManager;
  chatDb: ChatDb;
  vaultService: VaultService;
  emitAcpEvent: (
    spaceSlug: string,
    threadId: string,
    category: "lifecycle" | "stream" | "tool" | "permission" | "session" | "extension" | "error",
    event:
      | "process_spawned"
      | "initialized"
      | "authenticated"
      | "session_created"
      | "session_loaded"
      | "prompt_started"
      | "prompt_completed"
      | "user_message_chunk"
      | "agent_message_chunk"
      | "agent_thought_chunk"
      | "plan_update"
      | "available_commands_update"
      | "current_mode_update"
      | "config_option_update"
      | "session_info_update"
      | "usage_update"
      | "tool_call"
      | "tool_call_update"
      | "tool_call_content"
      | "permission_request"
      | "extension_request"
      | "extension_notification"
      | "rpc_error",
    data?: unknown,
    sessionId?: string
  ) => void;
};

export function registerAcpIpc(args: RegisterAcpIpcArgs) {
  const toAcpErrorPayload = (
    backend: "cursor" | "opencode",
    error: unknown,
    source: "bootstrap" | "prompt" | "session/cancel" | "session/set_mode" | "session/set_model" | "session/set_config_option"
  ) => {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    const authRelated = lower.includes("auth") || lower.includes("login");
    if (backend === "opencode" && authRelated) {
      return {
        source,
        message,
        userMessage: "OpenCode authentication is required. Run `opencode auth login` and retry."
      };
    }
    return { source, message };
  };

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

    const cwd = args.vaultService.getSpacePath(spaceSlug);

    try {
      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd,
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
      });
      if (ensured.state === "created" || ensured.state === "loaded") {
        args.emitAcpEvent(
          spaceSlug,
          threadId,
          "lifecycle",
          ensured.state === "created" ? "session_created" : "session_loaded",
          {
            sessionId: ensured.sessionId,
            modes: ensured.initialState?.modes,
            models: ensured.initialState?.models,
            configOptions: ensured.initialState?.configOptions
          },
          ensured.sessionId
        );
        if (ensured.initialState?.modes) {
          args.emitAcpEvent(
            spaceSlug,
            threadId,
            "session",
            "current_mode_update",
            {
              sessionUpdate: "current_mode_update",
              ...(ensured.initialState.modes as Record<string, unknown>)
            },
            ensured.sessionId
          );
        }
        if (ensured.initialState?.configOptions) {
          args.emitAcpEvent(
            spaceSlug,
            threadId,
            "session",
            "config_option_update",
            {
              sessionUpdate: "config_option_update",
              configOptions: ensured.initialState.configOptions
            },
            ensured.sessionId
          );
        }
      }
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
      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
      });
      if (ensured.state === "created" || ensured.state === "loaded") {
        args.emitAcpEvent(
          spaceSlug,
          threadId,
          "lifecycle",
          ensured.state === "created" ? "session_created" : "session_loaded",
          {
            sessionId: ensured.sessionId,
            modes: ensured.initialState?.modes,
            models: ensured.initialState?.models,
            configOptions: ensured.initialState?.configOptions
          },
          ensured.sessionId
        );
        if (ensured.initialState?.modes) {
          args.emitAcpEvent(
            spaceSlug,
            threadId,
            "session",
            "current_mode_update",
            {
              sessionUpdate: "current_mode_update",
              ...(ensured.initialState.modes as Record<string, unknown>)
            },
            ensured.sessionId
          );
        }
        if (ensured.initialState?.configOptions) {
          args.emitAcpEvent(
            spaceSlug,
            threadId,
            "session",
            "config_option_update",
            {
              sessionUpdate: "config_option_update",
              configOptions: ensured.initialState.configOptions
            },
            ensured.sessionId
          );
        }
      }

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
      const thread = args.chatDb.getThread(spaceSlug, threadId);
      if (!thread) throw new Error("Thread not found");

      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
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

      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
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

      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
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

      const ensured = await args.acpManager.ensureThreadSession({
        spaceSlug,
        threadId,
        cwd: args.vaultService.getSpacePath(spaceSlug),
        backend: thread.backend,
        existingSessionId: thread.backendSessionId
      });
      args.chatDb.updateThread(spaceSlug, threadId, {
        backendSessionId: ensured.sessionId,
        status: "ready"
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
