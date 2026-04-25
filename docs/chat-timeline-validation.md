# Chat timeline validation (post-change)

## Automated checks

- `bun run build:electron` — passes (Electron main + `chatDb` types).
- `bun run build` — passes (Vite renderer + electron `tsc`).

## Ordering (`seq`)

- SQLite `acp_events` gains `seq` (thread-scoped) via migration to `schema_version` **2**.
- New events: `seq` allocated atomically in `insertAcpEvent` (same transaction as `INSERT`).
- History: backfill uses legacy order `ORDER BY at ASC, id ASC` per thread, then `thread_event_seq.next_seq` is seeded to `MAX(seq)` so the next insert gets `MAX+1`.
- Renderer: `foldAcpEvents` sorts by `seq`, then `at`, then `id`.

## Virtualization (Legend List web)

- Dependency: `@legendapp/list@3.0.0-beta.44` with `import { LegendList } from "@legendapp/list/react"`.
- Chat pane: `estimatedItemSize` / `getEstimatedItemSize`, `maintainScrollAtEnd`, `maintainVisibleContentPosition`, `alignItemsAtEnd`, `initialScrollAtEnd`, pending messages in `ListFooterComponent`.

## Manual smoke (recommended)

1. Open an existing thread with history — confirm order unchanged vs. pre-migration.
2. Send prompts and stream replies — confirm no scroll jump when pinned to bottom; scroll up mid-stream — confirm new chunks do not yank viewport.
3. Rapid tool calls / same-millisecond `at` — confirm stable order (by `seq`).