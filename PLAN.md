# Open Skill Manager — Product & Build Plan

Local-first Mac app to see, sync, enable/disable, and update **Agent Skills** (`SKILL.md`) across Claude Code, Codex, OpenCode, Pi, and Cursor — globally and per repo. Built to sit beside [Conductor](https://www.conductor.build/): Conductor runs agents; this manages what skills those agents load.

**Non-goals (v1):** cloud sync, accounts, team sharing, marketplace payments, instruction-file editors (`AGENTS.md` / rules), Windows/Linux.

---

## Problem

Skills land in different folders per agent. You use several agents daily (especially Claude + Codex), across ~5–6 repos, and often cannot tell:

- what is installed where
- whether global and repo skills conflict
- why an agent behaves differently than another

Discovery of *new* skills matters less than **clarity, sync, and on/off control**.

---

## Product principles

1. **Truth on disk** — filesystem is source of truth; UI is a lens + controls.
2. **One canonical copy** — store once; project into agent/repo locations.
3. **Enable = link, disable = unlink** — never lose a skill when turning it off.
4. **Safe by default in discovery** — curated/verified sources first; arbitrary git URLs allowed but labeled *unverified*.
5. **Conductor-adjacent UX** — minimal, glanceable status, Mac-native feel; no dashboard clutter.

---

## Recommendations (decisions)

### Install strategy → **canonical store + symlinks**

Most common pattern for multi-tool package managers (Homebrew cellar, nvm, asdf):

```text
~/.open-skill-manager/
  skills/
    pdf-processing/
      1.0.0/          # immutable versioned copy
      1.1.0/
      current -> 1.1.0
  state.json          # enabled matrix, pinned repos, trusted sources
  cache/              # offline skill tarballs / git clones
```

**Enable for an agent** creates/updates a symlink in that agent’s skill root.  
**Disable** removes the symlink. The store keeps the files.

| Scope | Target roots (adapters) |
| --- | --- |
| Shared / portable | `~/.agents/skills/<name>` and repo `.agents/skills/<name>` |
| Claude Code | `~/.claude/skills/<name>`, repo `.claude/skills/<name>` |
| Codex | `~/.codex/skills/<name>` (plus shared `.agents`) |
| Cursor | `~/.cursor/skills/<name>` (plus shared; Cursor also reads Claude/Codex paths) |
| OpenCode | `~/.config/opencode/skills/<name>`, repo `.opencode/skills/<name>` |
| Pi | `~/.pi/agent/skills/<name>`, repo `.pi/skills/<name>` |

**Why not only `.agents/skills`?** Several agents read it, but Claude Code and OpenCode still prefer their own trees; copying only into one root leaves gaps. Adapters make “enable all” actually mean all.

**Fallback:** if symlink fails (rare on Mac user dirs), copy and record `install_mode: copy` so updates still work.

### Versions & updates

- Install pins a **semver or git SHA** into the store.
- `current` symlink (or state pointer) selects the active version.
- **Update** fetches latest from the skill’s declared source, writes a new version dir, then optionally flips `current` (prompt: Update now / pin).
- UI shows: installed version, available version, “outdated” badge.
- Per-skill pin: `hold: true` skips bulk update.

### Discovery & trust

| Tier | Source | Default UI treatment |
| --- | --- | --- |
| **Verified** | Bundled allowlist of official/vendor repos (e.g. `anthropics/skills`, `openai/skills`, MicrosoftDocs agent-skills, agentskills examples) + optional user-maintained `trusted-sources.json` | Shown in Discover; green “verified source” |
| **Unverified** | Any git URL / path the user pastes | Installable; amber “unverified”; not in default Discover feed |
| **Blocked** | Optional deny list (known malicious / broken) | Hidden or hard-blocked |

v1 does **not** try to sandbox skill scripts. Trust = **provenance of the repo**, plus a local **static scan** before install:

- must contain valid `SKILL.md` (agentskills frontmatter)
- flag `scripts/` that call `curl|bash`, write outside skill dir, or request broad tool permissions (`allowed-tools`)
- show scan summary; require explicit confirm for unverified + scripts

Offline: after first fetch, versions live under `cache/` / store; install/enable/disable/list work offline.

### App shape → **local web UI + CLI (not a hosted site)**

Yes — a **web UI**, but it only runs on your Mac:

- **CLI** `osm`: scan, list, enable, disable, install, update — scriptable, testable.
- **UI**: `osm ui` starts a local server on `127.0.0.1` and opens your browser. Same process talks to the filesystem; nothing is deployed to the internet.
- **Not** Electron/Tauri for v1 (extra packaging cost). Can wrap later as a menu-bar app if useful.
- **Dark mode only** — no light theme, no system toggle.
- Mac-only; paths documented as macOS home-relative.

This is the least moving parts and easiest to open-source.

### Scopes (all first-class)

Every skill can be controlled on three axes — all supported in v1:

| Scope | What it means | Example |
| --- | --- | --- |
| **Global** | Installed in the OSM store; available to project onto agents/repos | Skill exists at version 1.2.0 |
| **Per agent** | Enabled/disabled for Claude, Codex, OpenCode, Pi, Cursor independently (or bulk all) | On for Claude + Codex, off for Pi |
| **Per repo** | Enabled/disabled inside a registered repo’s project skill roots | On globally for Claude, also linked in `acme-api` |

UI surfaces both a **global dashboard** (skills → agent + repo coverage) and a **per-repo view**. Bulk: enable/disable all agents; align a repo to global; clear repo-only links.

### License → **MIT**

Best default for a personal side-project OSS tool: simple for contributors and for people who vendor adapters. (Apache-2.0 is fine if you later care more about patent grants; not needed day one.)

### Name

**Open Skill Manager** — repo `open_skill_manager`, CLI `osm`, UI title “Open Skill Manager”.

---

## UX (Conductor-adjacent)

### Global dashboard (home)

Minimal single composition:

- Left or top: **Skills** list (name, version, trust badge, outdated?)
- Each row expands to coverage: **per-agent toggles** (Claude, Codex, OpenCode, Pi, Cursor) + **which repos**
- Bulk: Enable all agents · Disable all agents · Update · Uninstall from store
- Quiet empty states; no stat strips or marketing chrome

### Per-repo view

Pick from a short repo list (~5–6 paths you register, or auto-detect recent git repos / optional Conductor workspace roots if readable):

- Skills enabled for this repo
- Drift vs global (“enabled globally but missing here”)
- One-click align: mirror global set → this repo, or clear repo overrides

### Discover (secondary)

- Default tab: **Verified** catalog only
- Search within allowlisted sources
- “Add source…” for advanced users (git URL → unverified)

### Visual direction

- **Dark mode only** (Conductor-adjacent, calm charcoal — not neon/glow)
- Super minimal, high clarity, dense-but-calm (status table, not cards)
- Glanceable enable toggles (per agent + per repo) — same “see at a glance” energy as Conductor
- Motion: only subtle row expand / toggle feedback

**Beside Conductor:** same repos, complementary job. Optional later: read Conductor’s known repo/workspace list from its app support directory if stable and documented; v1 just lets you add repo paths manually.

---

## Weekly-use success criteria (answering “what are those?”)

You would open Open Skill Manager every week if it reliably lets you:

1. **Answer in 10s:** “What skills does Claude have that Codex doesn’t?”
2. **Fix sync in 30s:** Enable skill X on all agents, or disable it everywhere after confusing behavior.
3. **Repo hygiene:** Open repo Y → see only what’s linked there → remove orphans / align to global.
4. **Safe add:** Install a verified skill, enable all, without hunting paths.
5. **Cleanup:** Uninstall or disable unused skills so agents stop picking up stale instructions.

If those five loops are fast, discovery can stay secondary.

---

## Architecture

```text
┌─────────────────────────────────────────┐
│  UI (Vite + React)  ·  CLI (osm)        │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Core library (TypeScript)              │
│  - SkillParser (SKILL.md / agentskills) │
│  - Store (versioned cellar)             │
│  - State (enabled matrix, pins)         │
│  - Scanner (find installs on disk)      │
│  - Updater / Installer                  │
│  - Trust (allowlist + static scan)      │
└──────────────────┬──────────────────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   AgentAdapters  RepoIndex  Catalog
   (paths/quirks) (5–6 repos) (verified sources)
```

**Language:** TypeScript (Node 22+ or Bun) end-to-end — fastest path for Mac CLI + local UI, easy OSS contributions.

**State file** (`state.json`): registered repos, per-skill enable map `{ skill, version, agents[], repos[] }`, trusted source URLs, holds.

**Import existing installs (day one):** scanner walks known roots, invents store entries (copy or adopt-in-place), so the first launch shows reality instead of an empty app.

---

## Agent adapter checklist (v1)

| Agent | Global roots to support | Project roots |
| --- | --- | --- |
| Claude Code | `~/.claude/skills` | `.claude/skills` |
| Codex | `~/.codex/skills`, `~/.agents/skills` | `.agents/skills` |
| Cursor | `~/.cursor/skills`, `~/.agents/skills` (+ reads Claude/Codex) | `.cursor/skills`, `.agents/skills` |
| OpenCode | `~/.config/opencode/skills`, `~/.agents/skills`, `~/.claude/skills` | `.opencode/skills`, `.agents/skills`, `.claude/skills` |
| Pi | `~/.pi/agent/skills`, `~/.agents/skills` | `.pi/skills`, `.agents/skills` |

Adapters expose: `detect()`, `listInstalled()`, `enable(skillPath)`, `disable(name)`, `isEnabled(name)`.

---

## Milestone plan

### M0 — Spec lock (this doc)
- [x] Problem, non-goals, install/trust/UX decisions
- [x] Confirm final CLI name (`osm`)
- [x] Confirm first verified source list (Anthropic, OpenAI, agentskills)

### M1 — Core + CLI
- [x] Parser + validate `SKILL.md`
- [x] Store (install version, set current)
- [x] Adapters for all five agents (global)
- [x] Commands: `scan`, `list`, `install`, `enable`, `disable`, `update`, `doctor`
- [x] Import orphan installs from disk

### M2 — Repo scope
- [x] Register repos
- [x] Project-level enable/disable via adapters
- [x] `osm repo status` / align / clean

### M3 — Local web UI (dark only)
- [x] Global skill list + per-agent matrix + repo coverage
- [x] Per-repo page with align/clean
- [x] Enable/disable: one agent, all agents, one repo, all registered repos
- [x] Conductor-like minimal dark chrome

### M4 — Discovery + trust
- [x] Bundled verified catalog (shallow clone or index JSON)
- [x] Unverified git install with warnings + script scan
- [x] Offline cache of previously fetched skills

### M5 — Polish / OSS
- [x] MIT license, CONTRIBUTING, adapter guide
- [ ] `brew` tap or simple install script
- [x] `doctor` explains conflicts (same skill name, multiple roots)
- [ ] Screenshot walkthrough in README

---

## Repo layout (proposed)

```text
open_skill_manager/
  PLAN.md
  README.md
  LICENSE
  package.json
  packages/
    core/          # store, parser, adapters, trust
    cli/           # osm
    ui/            # Vite app
  catalogs/
    verified.json  # allowlisted sources + skill index hints
  tests/
```

---

## Open questions (resolved)

1. CLI binary name: **`osm`**
2. On “enable all”, write **both** `.agents/skills` *and* agent-specific dirs when the agent uses both
3. First verified sources: Anthropic + OpenAI + agentskills examples

**Locked:** dark mode only · local web UI + CLI · global + per-agent + per-repo all in v1.
---

## Build order when implementation starts

1. `packages/core` scanner + Claude/Codex adapters (your daily drivers)  
2. Store + enable/disable via symlink  
3. CLI `list` / `enable` / `disable` usable without UI  
4. Remaining adapters (OpenCode, Pi, Cursor)  
5. Repo registration  
6. UI matrix  
7. Verified catalog  

Ship value as soon as Claude + Codex global sync works; everything else layers on.
