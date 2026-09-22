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

/**
 * Remove an OSM-managed link. Symlinks (and broken symlinks) are unlinked.
 * Real directories are left alone unless force=true (avoids deleting pre-OSM skills).
 */
export function unlinkSkill(destPath: string, opts: { force?: boolean } = {}): boolean {
  if (!fs.existsSync(destPath) && !isBrokenSymlink(destPath)) return false;
  const stat = fs.lstatSync(destPath);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(destPath);
    return true;
  }
  if (stat.isFile()) {
    fs.unlinkSync(destPath);
    return true;
  }
  if (stat.isDirectory()) {
    if (!opts.force) return false;
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
  const used: InstallMode[] = [];
  for (const root of roots) {
    used.push(linkSkill(storeSkillPath, path.join(root, skillName), opts.mode ?? "symlink"));
  }
  return { roots, mode: used.includes("copy") ? "copy" : "symlink" };
}

export function disableForAgent(
  agent: AgentId,
  skillName: string,
  opts: { home?: string; force?: boolean } = {},
): string[] {
  const home = opts.home ?? homeDir();
  const roots = agentRoots(agent, home).global;
  const removed: string[] = [];
  for (const root of roots) {
    const dest = path.join(root, skillName);
    if (unlinkSkill(dest, { force: opts.force })) removed.push(dest);
  }
  return removed;
}

export function isEnabledForAgent(
  agent: AgentId,
  skillName: string,
  opts: { home?: string } = {},
): boolean {
  const home = opts.home ?? homeDir();
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
  const used: InstallMode[] = [];
  const roots: string[] = [];
  for (const rel of relRoots) {
    const root = path.join(repoPath, rel);
    roots.push(root);
    used.push(linkSkill(storeSkillPath, path.join(root, skillName), opts.mode ?? "symlink"));
  }
  return { roots, mode: used.includes("copy") ? "copy" : "symlink" };
}

export function disableForRepo(
  repoPath: string,
  agent: AgentId,
  skillName: string,
  opts: { force?: boolean } = {},
): string[] {
  const removed: string[] = [];
  for (const rel of agentRoots(agent).project) {
    const dest = path.join(repoPath, rel, skillName);
    if (unlinkSkill(dest, { force: opts.force })) removed.push(dest);
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
  if (!fs.existsSync(destPath) && !isBrokenSymlink(destPath)) return;
  const stat = fs.lstatSync(destPath);
  if (stat.isSymbolicLink() || stat.isFile()) {
    fs.unlinkSync(destPath);
    return;
  }
  // Replacing a real directory on enable: only when linking over an existing OSM target.
  // Prefer symlink replacement for dirs that look like skills we manage.
  if (stat.isDirectory()) {
    fs.rmSync(destPath, { recursive: true, force: true });
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
