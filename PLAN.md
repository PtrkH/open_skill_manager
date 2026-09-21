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

### App shape → **local web UI + CLI (simplest)**

- **CLI** `osm` (or `open-skill-manager`): scan, list, enable, disable, install, update — scriptable, testable.
- **UI**: small local server (`osm ui` → `http://127.0.0.1:…`) opened in browser. No Electron/Tauri for v1 unless we later want menu-bar polish.
- Mac-only is fine; document paths as macOS home-relative.

This is the least moving parts and easiest to open-source.

### License → **MIT**

Best default for a personal side-project OSS tool: simple for contributors and for people who vendor adapters. (Apache-2.0 is fine if you later care more about patent grants; not needed day one.)

### Name

**Open Skill Manager** — repo `open_skill_manager`, CLI `osm`, UI title “Open Skill Manager”.

---

## UX (Conductor-adjacent)

### Global dashboard (home)

Minimal single composition:

- Left or top: **Skills** list (name, version, trust badge, outdated?)
- Each row expands or navigates to a **coverage matrix**: Agent × Enabled (Claude, Codex, OpenCode, Pi, Cursor) + **Global / which repos**
- Bulk actions: Enable all agents · Disable all · Update · Uninstall from store
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

- Super minimal, high clarity, dense-but-calm (status table, not cards)
- Neutral Mac-like surface; avoid purple-glow AI clichés
- Glanceable enable toggles (per agent) — same “see at a glance” energy as Conductor’s agent list
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
- [ ] Confirm final CLI name (`osm` vs `open-skill-manager`)
- [ ] Confirm first verified source list (3–5 repos)

### M1 — Core + CLI
- Parser + validate `SKILL.md`
- Store (install version, set current)
- Adapters for all five agents (global)
- Commands: `scan`, `list`, `install`, `enable`, `disable`, `update`, `doctor`
- Import orphan installs from disk

### M2 — Repo scope
- Register repos
- Project-level enable/disable via adapters
- `osm repo status` / align / clean

### M3 — Local UI
- Global skill list + agent matrix
- Per-repo page
- Enable all / disable all
- Conductor-like minimal chrome

### M4 — Discovery + trust
- Bundled verified catalog (shallow clone or index JSON)
- Unverified git install with warnings + script scan
- Offline cache of previously fetched skills

### M5 — Polish / OSS
- MIT license, CONTRIBUTING, adapter guide
- `brew` tap or simple install script
- `doctor` explains conflicts (same skill name, multiple roots)
- Screenshot walkthrough in README

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

## Open questions (only if you care)

1. CLI binary name: **`osm`** or longer?
2. On “enable all”, should we always write **both** `.agents/skills` *and* agent-specific dirs, or prefer shared `.agents` when the agent supports it?
3. First verified sources to ship: Anthropic + OpenAI + agentskills examples — add/remove any?
4. Should v1 UI be dark-friendly (Conductor-ish) or light System appearance?

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
