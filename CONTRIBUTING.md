# Contributing

## Setup

```bash
npm install
npm run build
npm test
```

## Layout

- `packages/core` — store, adapters, scanner, trust
- `packages/cli` — `osm` CLI + local API server
- `packages/ui` — dark local web UI
- `catalogs/verified.json` — verified discovery allowlist

## Adding an agent adapter

1. Extend `AgentId` in `packages/core/src/types.ts`
2. Add roots in `packages/core/src/paths.ts` (`agentRoots`)
3. Cover enable/disable in tests under `packages/core/tests`

## CLI

```bash
npm run osm -- list
npm run osm -- ui
```
