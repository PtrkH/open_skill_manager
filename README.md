# Open Skill Manager

Local-first Mac tool to **see, sync, enable/disable, and update** [Agent Skills](https://agentskills.io) across Claude Code, Codex, OpenCode, Pi, and Cursor — globally and per repo.

Built to sit beside [Conductor](https://www.conductor.build/): Conductor runs parallel agents; Open Skill Manager manages which skills those agents have loaded.

## Quick start

```bash
npm install
npm run build
npm run osm -- --help
```

### Common commands

```bash
# Import skills already on disk into the OSM store
npm run osm -- scan --import

# Install a local skill (see examples/demo-hello)
npm run osm -- install ./examples/demo-hello

# Enable for all agents (Claude, Codex, Cursor, OpenCode, Pi)
npm run osm -- enable demo-hello

# Coverage matrix
npm run osm -- list

# Register a repo and align project skills to global enables
npm run osm -- repo add /path/to/repo
npm run osm -- repo align <repo-id>

# Dark local UI on http://127.0.0.1:8787
npm run osm -- ui
```

## How it works

1. Skills are copied into a versioned store: `~/.open-skill-manager/skills/<name>/<version>/`
2. **Enable** creates symlinks into each agent’s skill directories (and optional per-repo paths)
3. **Disable** removes those links; the store copy stays until you uninstall

## Scopes

| Scope | Meaning |
| --- | --- |
| Global | In the OSM store |
| Per agent | Linked for Claude / Codex / Cursor / OpenCode / Pi |
| Per repo | Linked under that repo’s project skill roots |

## Trust

Discover defaults to **verified** sources in `catalogs/verified.json`. Arbitrary git URLs install as **unverified** and are scanned for risky scripts.

## Docs

- [PLAN.md](./PLAN.md) — product decisions and milestones
- [CONTRIBUTING.md](./CONTRIBUTING.md) — adapter guide

## License

MIT
