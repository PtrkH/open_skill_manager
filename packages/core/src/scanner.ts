import fs from "node:fs";
import path from "node:path";
import { AGENTS } from "./types.js";
import type { AgentId, InstalledLocation, RegisteredRepo } from "./types.js";
import { agentRoots, allGlobalSkillRoots, homeDir } from "./paths.js";
import { readSkillDir } from "./parser.js";

function listSkillDirs(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => path.join(root, e.name))
    .filter((p) => fs.existsSync(path.join(p, "SKILL.md")) || isLinkToSkill(p));
}

function isLinkToSkill(p: string): boolean {
  try {
    const real = fs.realpathSync(p);
    return fs.existsSync(path.join(real, "SKILL.md"));
  } catch {
    return false;
  }
}

function describeLocation(
  skillPath: string,
  agent: AgentId | "shared",
  scope: "global" | "project",
  root: string,
  repoId?: string,
): InstalledLocation {
  let viaSymlink = false;
  let target: string | undefined;
  try {
    const st = fs.lstatSync(skillPath);
    viaSymlink = st.isSymbolicLink();
    if (viaSymlink) target = fs.readlinkSync(skillPath);
  } catch {
    /* ignore */
  }
  let name = path.basename(skillPath);
  try {
    name = readSkillDir(skillPath).frontmatter.name;
  } catch {
    /* keep basename */
  }
  return {
    agent,
    scope,
    root,
    skillPath,
    name,
    viaSymlink,
    target,
    repoId,
  };
}

function agentForRoot(root: string, home: string): AgentId | "shared" {
  const normalized = path.resolve(root);
  if (normalized === path.join(home, ".agents", "skills")) return "shared";
  for (const agent of AGENTS) {
    const roots = agentRoots(agent, home).global.map((r) => path.resolve(r));
    if (roots.includes(normalized) && roots[0] === normalized) return agent;
  }
  for (const agent of AGENTS) {
    if (agentRoots(agent, home).global.map((r) => path.resolve(r)).includes(normalized)) {
      return agent;
    }
  }
  return "shared";
}

export function scanGlobalInstalls(home = homeDir()): InstalledLocation[] {
  const out: InstalledLocation[] = [];
  for (const root of allGlobalSkillRoots(home)) {
    const agent = agentForRoot(root, home);
    for (const skillPath of listSkillDirs(root)) {
      out.push(describeLocation(skillPath, agent, "global", root));
    }
  }
  return out;
}

export function scanRepoInstalls(
  repos: RegisteredRepo[],
  home = homeDir(),
): InstalledLocation[] {
  const out: InstalledLocation[] = [];
  for (const repo of repos) {
    for (const agent of AGENTS) {
      for (const rel of agentRoots(agent, home).project) {
        const root = path.join(repo.path, rel);
        for (const skillPath of listSkillDirs(root)) {
          out.push(describeLocation(skillPath, agent, "project", root, repo.id));
        }
      }
    }
  }
  return out;
}

export function scanAll(repos: RegisteredRepo[], home = homeDir()): InstalledLocation[] {
  return [...scanGlobalInstalls(home), ...scanRepoInstalls(repos, home)];
}
