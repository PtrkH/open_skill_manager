import fs from "node:fs";
import path from "node:path";
import { ensureDir, skillsStoreDir } from "./paths.js";
import { readSkillDir } from "./parser.js";

function copyRecursive(src: string, dest: string): void {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(from);
      fs.symlinkSync(target, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

export function skillVersionsDir(name: string, home?: string): string {
  return path.join(skillsStoreDir(home), name);
}

export function skillVersionPath(name: string, version: string, home?: string): string {
  return path.join(skillVersionsDir(name, home), version);
}

export function skillCurrentPath(name: string, home?: string): string {
  return path.join(skillVersionsDir(name, home), "current");
}

export function listStoredVersions(name: string, home?: string): string[] {
  const dir = skillVersionsDir(name, home);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "current")
    .map((e) => e.name)
    .sort();
}

export function getCurrentVersion(name: string, home?: string): string | null {
  const current = skillCurrentPath(name, home);
  if (!fs.existsSync(current)) return null;
  try {
    const target = fs.readlinkSync(current);
    return path.basename(target);
  } catch {
    return null;
  }
}

export function resolveCurrentSkillPath(name: string, home?: string): string | null {
  const current = skillCurrentPath(name, home);
  if (!fs.existsSync(current)) return null;
  return fs.realpathSync(current);
}

/** Install a skill directory into the versioned store and point current at it. */
export function installSkillToStore(
  sourceDir: string,
  opts: { version?: string; name?: string; home?: string } = {},
): { name: string; version: string; path: string } {
  const parsed = readSkillDir(sourceDir);
  const name = opts.name ?? parsed.frontmatter.name;
  const version =
    opts.version ??
    parsed.frontmatter.metadata?.version ??
    shortStamp();

  const dest = skillVersionPath(name, version, opts.home);
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
  }
  ensureDir(path.dirname(dest));
  copyRecursive(sourceDir, dest);

  // Ensure directory name semantics: store keeps version folder; skill name is parent
  setCurrentVersion(name, version, opts.home);
  return { name, version, path: dest };
}

export function setCurrentVersion(name: string, version: string, home?: string): void {
  const versionPath = skillVersionPath(name, version, home);
  if (!fs.existsSync(versionPath)) {
    throw new Error(`Version ${version} of ${name} not found in store`);
  }
  const current = skillCurrentPath(name, home);
  try {
    fs.lstatSync(current);
    fs.unlinkSync(current);
  } catch {
    /* no current yet */
  }
  fs.symlinkSync(version, current);
}

export function uninstallFromStore(name: string, home?: string): boolean {
  const dir = skillVersionsDir(name, home);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

function shortStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
