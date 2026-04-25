# ACP Event Contract (Basis)

This document defines the normalized ACP event stream emitted by Basis for UI integration.

Implementation note: Basis uses the official `@agentclientprotocol/sdk` (`ClientSideConnection` + `ndJsonStream`) for ACP transport/protocol handling.

## IPC APIs

- Live stream: `window.basis.events.onAcpEvent((event) => ...)`
- Backfill history for a thread: `window.basis.acp.listEvents({ spaceSlug, threadId })`
- Resolve permission prompts: `window.basis.acp.respondPermission({ requestId, outcome })`

All events share this shape:

```ts
type AcpTranslatedEvent = {
  id: string;
  at: string; // ISO-8601 UTC
  /** Monotonic per-thread sequence from SQLite; primary ordering key (tie-break: `at`, then `id`). */
  seq: number;
  spaceSlug: string;
  threadId: string;
  category: "lifecycle" | "stream" | "tool" | "permission" | "session" | "extension" | "error";
  event: string; // see tables below
  sessionId?: string;
  data?: unknown;
};
```

## Lifecycle Events

- `process_spawned` - ACP process created or bootstrap requested.
- `initialized` - `initialize` request succeeded.
- `authenticated` - `authenticate(<provider-auth-method>)` succeeded.
- `session_created` - `session/new` succeeded.
- `session_loaded` - `session/load` succeeded.
- `prompt_started` - `session/prompt` request sent.
- `prompt_completed` - `session/prompt` response received.

## Stream Events (`session/update`)

All ACP `session/update` variants are translated:

- `user_message_chunk` (`sessionUpdate: "user_message_chunk"`)
- `agent_message_chunk` (`sessionUpdate: "agent_message_chunk"`)
- `agent_thought_chunk` (`sessionUpdate: "agent_thought_chunk"`)
- `plan_update` (`sessionUpdate: "plan"`)
- `available_commands_update` (`sessionUpdate: "available_commands_update"`)
- `current_mode_update` (`sessionUpdate: "current_mode_update"`)
- `config_option_update` (`sessionUpdate: "config_option_update"`)
- `session_info_update` (`sessionUpdate: "session_info_update"`)
- `usage_update` (`sessionUpdate: "usage_update"`)

## Tool Events

- `tool_call` (`sessionUpdate: "tool_call"`)
- `tool_call_update` (`sessionUpdate: "tool_call_update"`)
- `tool_call_content` (one emitted per `tool_call_update.content[]` item)
  - includes content type details for:
    - `content` blocks
    - `diff` (file edit payloads)
    - `terminal`

## Permission Events

- `permission_request` for `session/request_permission`
  - Includes a generated `requestId` used to correlate UI responses.
  - Clients should render all provided `options[]` and submit the chosen `optionId` unchanged:

```ts
await window.basis.acp.respondPermission({
  requestId,
  outcome: { outcome: "selected", optionId: selectedOptionId }
});
```

or cancel:

```ts
await window.basis.acp.respondPermission({
  requestId,
  outcome: { outcome: "cancelled" }
});
```

- Safety behavior:
  - Pending permission requests auto-cancel after 5 minutes if unresolved.

## Cursor Extension Events

Basis translates Cursor extension methods:

- Blocking request methods -> `extension_request`
  - `cursor/ask_question`
  - `cursor/create_plan`
- Notification methods -> `extension_notification`
  - `cursor/update_todos`
  - `cursor/task`
  - `cursor/generate_image`

## Error Events

- `rpc_error` emitted for:
  - RPC response errors
  - unknown `sessionUpdate` variants
  - unsupported inbound request methods
  - ACP process stderr/error/exit signals

## Notes for UI Agents

- Use `category + event` as the stable rendering key.
- Treat `data` as protocol-adjacent payload (can evolve).
- In multi-provider mode, runtime/process/auth-related events may include `data.backend` (`cursor` or `opencode`).
- For chat transcript rendering, prefer:
  - `agent_message_chunk`
  - `user_message_chunk`
  - `agent_thought_chunk` (optional, if exposed)
- For activity timeline, prefer:
  - `tool_call`, `tool_call_update`, `tool_call_content`
  - `permission_request`
  - extension events
