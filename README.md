# Basis

Electron desktop app for local-first AI-assisted research workflows.

## Stack

- Electron
- React + Vite
- Electron Builder
- Milkdown (Crepe UI)
- Local metadata with electron-store

## Development

```bash
bun install
bun run dev:renderer
bun run dev:electron
```

or run both in one terminal:

```bash
bun run dev
```

## Build

```bash
bun run build
bun run dist
```

## ACP Integration Notes

- Normalized ACP event contract: `docs/acp-event-contract.md`
