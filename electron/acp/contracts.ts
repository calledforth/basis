import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type * as acp from "@agentclientprotocol/sdk";
import type {
  PermissionResponseOutcome,
  SessionRoute,
  ThreadBackend,
} from "../core/types.js";

export type AcpEventCategory =
  | "lifecycle"
  | "stream"
  | "tool"
  | "permission"
  | "session"
  | "extension"
  | "error";

export type AcpEventName =
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
  | "rpc_error";

export type AcpManagerDeps = {
  emitAcpEvent: (
    spaceSlug: string,
    threadId: string,
    category: AcpEventCategory,
    event: AcpEventName,
    data?: unknown,
    sessionId?: string,
  ) => void;
  addLog: (entry: {
    scope: "acp";
    level: "info" | "warn" | "error";
    message: string;
    data?: unknown;
  }) => void;
  onSessionTitleUpdated: (route: SessionRoute, title: string) => void;
};

export type RuntimeState = {
  backend: ThreadBackend;
  process: ChildProcessWithoutNullStreams | null;
  connection: acp.ClientSideConnection | null;
  initialized: boolean;
  authenticated: boolean;
  runtimeGeneration: number;
  bootstrapPromise: Promise<void> | null;
  threadToSession: Map<string, string>;
  sessionToThread: Map<string, SessionBinding>;
  loadedSessionByThread: Map<string, { sessionId: string; runtimeGeneration: number }>;
};

export type PendingPermissionRequest = {
  requestId: string;
  backend: ThreadBackend;
  spaceSlug: string;
  threadId: string;
  sessionId?: string;
  options: Array<{ optionId?: string; kind?: string; name?: string }>;
  resolve: (value: { outcome: PermissionResponseOutcome }) => void;
  timeoutHandle: NodeJS.Timeout;
};

export type SessionBinding = SessionRoute & {
  backend: ThreadBackend;
  runtimeGeneration: number;
};

export const PERMISSION_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
