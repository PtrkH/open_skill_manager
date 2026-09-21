import fs from "node:fs";
import path from "node:path";
import { ensureDir, statePath } from "./paths.js";
import type { OsmState, RegisteredRepo, SkillEnablement, SkillRecord } from "./types.js";

const EMPTY: OsmState = {
  version: 1,
  repos: [],
  skills: {},
  enabled: {},
  trustedSources: [
    "github.com/anthropics/skills",
    "github.com/openai/skills",
    "github.com/agentskills/agentskills",
  ],
};

export function defaultState(): OsmState {
  return structuredClone(EMPTY);
}

export function loadState(home?: string): OsmState {
  const file = statePath(home);
  if (!fs.existsSync(file)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<OsmState>;
    return {
      version: 1,
      repos: raw.repos ?? [],
      skills: raw.skills ?? {},
      enabled: raw.enabled ?? {},
      trustedSources: raw.trustedSources ?? EMPTY.trustedSources,
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state: OsmState, home?: string): void {
  const file = statePath(home);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function upsertSkillRecord(state: OsmState, record: SkillRecord): void {
  state.skills[record.name] = { ...state.skills[record.name], ...record };
  if (!state.enabled[record.name]) {
    state.enabled[record.name] = { agents: [], repos: [] };
  }
}

export function getEnablement(state: OsmState, name: string): SkillEnablement {
  return state.enabled[name] ?? { agents: [], repos: [] };
}

export function setEnablement(state: OsmState, name: string, enabled: SkillEnablement): void {
  state.enabled[name] = {
    agents: [...new Set(enabled.agents)],
    repos: [...new Set(enabled.repos)],
  };
}

export function registerRepo(
  state: OsmState,
  repoPath: string,
  name?: string,
): RegisteredRepo {
  const resolved = path.resolve(repoPath);
  const existing = state.repos.find((r) => r.path === resolved);
  if (existing) return existing;
  const id = slugify(name ?? path.basename(resolved));
  let unique = id;
  let i = 2;
  while (state.repos.some((r) => r.id === unique)) {
    unique = `${id}-${i++}`;
  }
  const repo: RegisteredRepo = {
    id: unique,
    path: resolved,
    name: name ?? path.basename(resolved),
  };
  state.repos.push(repo);
  return repo;
}

export function unregisterRepo(state: OsmState, idOrPath: string): boolean {
  const before = state.repos.length;
  state.repos = state.repos.filter((r) => r.id !== idOrPath && r.path !== path.resolve(idOrPath));
  for (const key of Object.keys(state.enabled)) {
    state.enabled[key].repos = state.enabled[key].repos.filter(
      (id) => state.repos.some((r) => r.id === id),
    );
  }
  return state.repos.length < before;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "repo";
}
