# ACP Multi-Provider Runtime (Cursor + OpenCode)

Basis supports two ACP backends:

- `cursor` -> `agent acp` (override with `ACP_CURSOR_BIN`, legacy fallback `ACP_AGENT_BIN`)
- `opencode` -> `opencode acp` (override with `ACP_OPENCODE_BIN`)

## Thread Affinity

Each thread is permanently bound to one backend (`threads.backend`).

- New chat flow prompts for provider.
- Existing legacy rows are migrated to `cursor`.
- A thread never switches provider after creation.

## Runtime Model

`AcpManager` keeps a separate ACP runtime per backend.

- separate process/connection lifecycle
- separate session routing maps
- separate prompt queue keys
- shared normalized event output to renderer

All ACP transport is implemented via `@agentclientprotocol/sdk`:

- `ndJsonStream`
- `ClientSideConnection`
- standard ACP methods/notifications

## Authentication

Auth method IDs are discovered from `initialize().authMethods`.
No provider hard-coded `authenticate` IDs are used.

Selection strategy:

- Cursor: prefer `cursor_login`, then other cursor-like IDs, then first ID
- OpenCode: prefer `opencode-login`, then opencode/login-like IDs, then first ID

If OpenCode auth is required and session creation fails, the UI receives inline guidance:

- `OpenCode authentication is required. Run \`opencode auth login\` and retry.`

## Storage Migration

Schema version bumped to `3`.

Migration step:

```sql
UPDATE threads
SET backend = 'cursor'
WHERE backend IS NULL OR TRIM(backend) = '';
```

No thread/session rows are dropped.
