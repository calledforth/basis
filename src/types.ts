export type SpaceListItem = {
  slug: string;
  title: string;
  overviewPath: string;
  created?: string;
  updated?: string;
  lastAccessedAt?: string;
};

export type FileNode = {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
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

export type AgentEvent =
  | { kind: "status"; message: string; at: string }
  | { kind: "chunk"; content: string; at: string }
  | { kind: "tool"; toolName: string; detail?: string; at: string };

export type AcpPermissionOption = {
  optionId: string;
  name: string;
  kind?: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
};

export type AcpPermissionRequestEventData = {
  requestId: string;
  sessionId: string;
  toolCall?: unknown;
  options: AcpPermissionOption[];
  _meta?: unknown;
};

export type AcpPermissionResponseOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type AcpTranslatedEvent = {
  id: string;
  at: string;
  /** Monotonic per-thread ordering stamp from persistence (primary sort key). */
  seq: number;
  spaceSlug: string;
  threadId: string;
  category: "lifecycle" | "stream" | "tool" | "permission" | "session" | "extension" | "error";
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
    | "rpc_error";
  sessionId?: string;
  data?: unknown;
};

export type AppLogEntry = {
  id: string;
  at: string;
  level: "info" | "warn" | "error";
  scope: "acp" | "vault" | "thread" | "app";
  message: string;
  data?: unknown;
};

export type AppConfig = {
  vaultPath?: string;
};

export type AppPrefs = {
  fontSans?: string;
};

export type SpaceWorkspaceUi = {
  chatOpen?: boolean;
  editorFileTreeOpen?: boolean;
  mainHorizontalLayout?: Record<string, number>;
};
