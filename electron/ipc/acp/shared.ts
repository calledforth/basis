import type { AcpManager } from "../../acp/manager.js";
import type { ThreadBackend } from "../../core/types.js";
import type { ChatDb } from "../../core/chatDb.js";
import type { VaultService } from "../../vault/service.js";
import type { AcpEventCategory, AcpEventName } from "../../acp/contracts.js";

export type EmitAcpEvent = (
  spaceSlug: string,
  threadId: string,
  category: AcpEventCategory,
  event: AcpEventName,
  data?: unknown,
  sessionId?: string,
) => void;

export function toAcpErrorPayload(
  backend: ThreadBackend,
  error: unknown,
  source:
    | "bootstrap"
    | "prompt"
    | "session/cancel"
    | "session/set_mode"
    | "session/set_model"
    | "session/set_config_option",
) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  const authRelated = lower.includes("auth") || lower.includes("login");
  if (backend === "opencode" && authRelated) {
    return {
      source,
      message,
      userMessage: "OpenCode authentication is required. Run `opencode auth login` and retry.",
    };
  }
  return { source, message };
}

export async function ensureThreadSessionAndPersist(args: {
  acpManager: AcpManager;
  chatDb: ChatDb;
  vaultService: VaultService;
  spaceSlug: string;
  threadId: string;
}) {
  const thread = args.chatDb.getThread(args.spaceSlug, args.threadId);
  if (!thread) throw new Error("Thread not found");

  const ensured = await args.acpManager.ensureThreadSession({
    spaceSlug: args.spaceSlug,
    threadId: args.threadId,
    cwd: args.vaultService.getSpacePath(args.spaceSlug),
    backend: thread.backend,
    existingSessionId: thread.backendSessionId,
  });

  args.chatDb.updateThread(args.spaceSlug, args.threadId, {
    backendSessionId: ensured.sessionId,
    status: "ready",
  });

  return { thread, ensured };
}

export function emitSessionBootstrapEvents(args: {
  ensured: {
    sessionId: string;
    state: "created" | "loaded" | "reused";
    initialState?: {
      modes?: unknown;
      models?: unknown;
      configOptions?: unknown;
    };
  };
  spaceSlug: string;
  threadId: string;
  emitAcpEvent: EmitAcpEvent;
}) {
  const { ensured, spaceSlug, threadId, emitAcpEvent } = args;
  if (ensured.state !== "created" && ensured.state !== "loaded") return;

  emitAcpEvent(
    spaceSlug,
    threadId,
    "lifecycle",
    ensured.state === "created" ? "session_created" : "session_loaded",
    {
      sessionId: ensured.sessionId,
      modes: ensured.initialState?.modes,
      models: ensured.initialState?.models,
      configOptions: ensured.initialState?.configOptions,
    },
    ensured.sessionId,
  );
  if (ensured.initialState?.modes) {
    emitAcpEvent(
      spaceSlug,
      threadId,
      "session",
      "current_mode_update",
      {
        sessionUpdate: "current_mode_update",
        ...(ensured.initialState.modes as Record<string, unknown>),
      },
      ensured.sessionId,
    );
  }
  if (ensured.initialState?.configOptions) {
    emitAcpEvent(
      spaceSlug,
      threadId,
      "session",
      "config_option_update",
      {
        sessionUpdate: "config_option_update",
        configOptions: ensured.initialState.configOptions,
      },
      ensured.sessionId,
    );
  }
}
