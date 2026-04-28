export type WorkspaceLayoutMode = "classic" | "columns";

export type AppPrefs = {
  /** UI font family name (matches --basis-font-sans), e.g. "Inter" */
  fontSans?: string;
  /** Global app theme mode */
  themeMode?: "dark" | "light";
  workspaceLayout?: WorkspaceLayoutMode;
};

/** Per-space workspace chrome (chat pane, editor sidebar, panel split). */
export type SpaceWorkspaceUi = {
  chatOpen?: boolean;
  editorFileTreeOpen?: boolean;
  /** react-resizable-panels layout: panel id -> percentage 0..100 */
  mainHorizontalLayout?: Record<string, number>;
  columnsLayout?: Record<string, number>;
};

export type SpaceMeta = {
  lastAccessedAt?: string;
  workspaceUi?: SpaceWorkspaceUi;
};

export type ThreadBackend = "cursor" | "opencode";

export type ThreadRecord = {
  threadId: string;
  spaceSlug: string;
  backend: ThreadBackend;
  backendSessionId?: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  status: "creating" | "ready" | "broken" | "archived";
};

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  at: string;
  level: LogLevel;
  scope: "acp" | "vault" | "thread" | "app";
  message: string;
  data?: unknown;
};

export type AcpEventCategory = "lifecycle" | "stream" | "tool" | "permission" | "session" | "extension" | "error";
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
  | "current_model_update"
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

export type AcpEventEntry = {
  id: string;
  at: string;
  /** Monotonic per-thread ordering stamp assigned in the main process (stable across equal `at`). */
  seq: number;
  spaceSlug: string;
  threadId: string;
  category: AcpEventCategory;
  event: AcpEventName;
  sessionId?: string;
  data?: unknown;
};

export type PermissionResponseOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type SessionRoute = {
  spaceSlug: string;
  threadId: string;
};

export function nowIso(): string {
  return new Date().toISOString();
}
