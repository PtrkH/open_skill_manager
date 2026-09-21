# Open Skill Manager

Local-first Mac tool to **see, sync, enable/disable, and update** [Agent Skills](https://agentskills.io) across Claude Code, Codex, OpenCode, Pi, and Cursor — globally and per repo.

Built to sit beside [Conductor](https://www.conductor.build/): Conductor runs parallel agents; Open Skill Manager manages which skills those agents have loaded.

**Status:** planning. See [PLAN.md](./PLAN.md) for product decisions, architecture, and milestones.

## Why

Skills install into different folders per agent. Across a handful of repos it’s easy to lose track of what’s enabled where — and get confusing, inconsistent agent behavior.

## Direction (v1)

- Canonical skill store + **symlinks** to enable/disable without deleting
- **Versions & updates**, with pins
- Global dashboard + per-repo breakdown
- Discovery biased to **verified** sources; arbitrary git URLs allowed but marked unverified
- CLI + local browser UI (simplest stack)
- macOS only · MIT · skills-first (instruction files later)

## License

MIT (intended).
