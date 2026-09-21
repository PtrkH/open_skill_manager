import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentId } from "./types.js";

export function homeDir(override?: string): string {
  return override ?? process.env.OSM_HOME ?? os.homedir();
}

export function osmRoot(home = homeDir()): string {
  return process.env.OSM_ROOT ?? path.join(home, ".open-skill-manager");
}

export function skillsStoreDir(home = homeDir()): string {
  return path.join(osmRoot(home), "skills");
}

export function statePath(home = homeDir()): string {
  return path.join(osmRoot(home), "state.json");
}

export function cacheDir(home = homeDir()): string {
  return path.join(osmRoot(home), "cache");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export interface AgentRoots {
  global: string[];
  project: string[];
}

/** Primary + shared roots. Enable writes to all listed global roots. */
export function agentRoots(agent: AgentId, home = homeDir()): AgentRoots {
  const agentsShared = path.join(home, ".agents", "skills");
  switch (agent) {
    case "claude":
      return {
        global: [path.join(home, ".claude", "skills")],
        project: [".claude/skills"],
      };
    case "codex":
      return {
        global: [path.join(home, ".codex", "skills"), agentsShared],
        project: [".agents/skills"],
      };
    case "cursor":
      return {
        global: [path.join(home, ".cursor", "skills"), agentsShared],
        project: [".cursor/skills", ".agents/skills"],
      };
    case "opencode":
      return {
        global: [
          path.join(home, ".config", "opencode", "skills"),
          agentsShared,
          path.join(home, ".claude", "skills"),
        ],
        project: [".opencode/skills", ".agents/skills", ".claude/skills"],
      };
    case "pi":
      return {
        global: [path.join(home, ".pi", "agent", "skills"), agentsShared],
        project: [".pi/skills", ".agents/skills"],
      };
  }
}

export function allGlobalSkillRoots(home = homeDir()): string[] {
  const set = new Set<string>();
  for (const agent of ["claude", "codex", "cursor", "opencode", "pi"] as AgentId[]) {
    for (const root of agentRoots(agent, home).global) {
      set.add(root);
    }
  }
  return [...set];
}

export function expandHome(p: string, home = homeDir()): string {
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  if (p === "~") return home;
  return p;
}
