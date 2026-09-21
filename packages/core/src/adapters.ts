import fs from "node:fs";
import path from "node:path";
import { agentRoots, ensureDir, homeDir } from "./paths.js";
import type { AgentId, InstallMode } from "./types.js";

export function linkSkill(
  targetSkillPath: string,
  destPath: string,
  mode: InstallMode = "symlink",
): InstallMode {
  ensureDir(path.dirname(destPath));
  removeIfPresent(destPath);

  if (mode === "copy") {
    copyRecursive(targetSkillPath, destPath);
    return "copy";
  }

  try {
    fs.symlinkSync(targetSkillPath, destPath);
    return "symlink";
  } catch {
    copyRecursive(targetSkillPath, destPath);
    return "copy";
  }
}

export function unlinkSkill(destPath: string): boolean {
  if (!fs.existsSync(destPath) && !isBrokenSymlink(destPath)) return false;
  const stat = fs.lstatSync(destPath);
  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.unlinkSync(destPath);
    return true;
  }
  if (stat.isDirectory()) {
    fs.rmSync(destPath, { recursive: true, force: true });
    return true;
  }
  return false;
}

export function isSkillLinked(root: string, name: string): boolean {
  const dest = path.join(root, name);
  return fs.existsSync(dest) || isBrokenSymlink(dest);
}

export function enableForAgent(
  agent: AgentId,
  skillName: string,
  storeSkillPath: string,
  opts: { home?: string; mode?: InstallMode } = {},
): { roots: string[]; mode: InstallMode } {
  const home = opts.home ?? homeDir();
  const roots = agentRoots(agent, home).global;
  let mode: InstallMode = opts.mode ?? "symlink";
  for (const root of roots) {
    mode = linkSkill(storeSkillPath, path.join(root, skillName), mode);
  }
  return { roots, mode };
}

export function disableForAgent(
  agent: AgentId,
  skillName: string,
  opts: { home?: string } = {},
): string[] {
  const home = opts.home ?? homeDir();
  const roots = agentRoots(agent, home).global;
  const removed: string[] = [];
  for (const root of roots) {
    const dest = path.join(root, skillName);
    if (unlinkSkill(dest)) removed.push(dest);
  }
  return removed;
}

export function isEnabledForAgent(
  agent: AgentId,
  skillName: string,
  opts: { home?: string } = {},
): boolean {
  const home = opts.home ?? homeDir();
  // Consider enabled if present in the agent's primary (first) global root
  const primary = agentRoots(agent, home).global[0];
  return isSkillLinked(primary, skillName);
}

export function enableForRepo(
  repoPath: string,
  agent: AgentId,
  skillName: string,
  storeSkillPath: string,
  opts: { mode?: InstallMode } = {},
): { roots: string[]; mode: InstallMode } {
  const relRoots = agentRoots(agent).project;
  let mode: InstallMode = opts.mode ?? "symlink";
  const roots: string[] = [];
  for (const rel of relRoots) {
    const root = path.join(repoPath, rel);
    roots.push(root);
    mode = linkSkill(storeSkillPath, path.join(root, skillName), mode);
  }
  return { roots, mode };
}

export function disableForRepo(
  repoPath: string,
  agent: AgentId,
  skillName: string,
): string[] {
  const removed: string[] = [];
  for (const rel of agentRoots(agent).project) {
    const dest = path.join(repoPath, rel, skillName);
    if (unlinkSkill(dest)) removed.push(dest);
  }
  return removed;
}

export function isEnabledInRepo(
  repoPath: string,
  agent: AgentId,
  skillName: string,
): boolean {
  const primary = agentRoots(agent).project[0];
  return isSkillLinked(path.join(repoPath, primary), skillName);
}

function removeIfPresent(destPath: string): void {
  if (fs.existsSync(destPath) || isBrokenSymlink(destPath)) {
    const stat = fs.lstatSync(destPath);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      fs.rmSync(destPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(destPath);
    }
  }
}

function isBrokenSymlink(p: string): boolean {
  try {
    fs.lstatSync(p);
    return !fs.existsSync(p);
  } catch {
    return false;
  }
}

function copyRecursive(src: string, dest: string): void {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}
