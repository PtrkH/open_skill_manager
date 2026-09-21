import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cacheDir, ensureDir } from "./paths.js";
import { readSkillDir } from "./parser.js";
import { scanSkillDir } from "./trust.js";

export interface FetchResult {
  skillDir: string;
  cleanup: () => void;
  source: string;
}

/** Fetch a skill from a local path or git URL into a temp/cache dir. */
export function fetchSkillSource(
  source: string,
  opts: { subpath?: string; home?: string } = {},
): FetchResult {
  const resolved = path.resolve(source);
  if (fs.existsSync(resolved)) {
    const skillDir = opts.subpath ? path.join(resolved, opts.subpath) : resolved;
    readSkillDir(skillDir);
    return { skillDir, cleanup: () => undefined, source: resolved };
  }

  if (!looksLikeGit(source)) {
    throw new Error(`Source not found and not a git URL: ${source}`);
  }

  const cache = path.join(cacheDir(opts.home), "git", hash(source));
  ensureDir(path.dirname(cache));
  if (fs.existsSync(cache)) {
    try {
      execFileSync("git", ["-C", cache, "fetch", "--depth", "1", "origin"], {
        stdio: "ignore",
      });
      execFileSync("git", ["-C", cache, "reset", "--hard", "FETCH_HEAD"], {
        stdio: "ignore",
      });
    } catch {
      fs.rmSync(cache, { recursive: true, force: true });
      cloneShallow(source, cache);
    }
  } else {
    cloneShallow(source, cache);
  }

  const skillDir = opts.subpath ? path.join(cache, opts.subpath) : findSkillRoot(cache);
  readSkillDir(skillDir);
  const scan = scanSkillDir(skillDir);
  if (!scan.ok) {
    const dangers = scan.findings.filter((f) => f.kind === "danger").map((f) => f.message);
    throw new Error(`Skill failed security scan:\n- ${dangers.join("\n- ")}`);
  }

  return {
    skillDir,
    cleanup: () => undefined,
    source,
  };
}

function cloneShallow(url: string, dest: string): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "osm-clone-"));
  try {
    execFileSync("git", ["clone", "--depth", "1", url, tmp], { stdio: "ignore" });
    ensureDir(path.dirname(dest));
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `Failed to clone ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function findSkillRoot(repoRoot: string): string {
  const direct = path.join(repoRoot, "SKILL.md");
  if (fs.existsSync(direct)) return repoRoot;

  const skillsDir = path.join(repoRoot, "skills");
  if (fs.existsSync(skillsDir)) {
    const kids = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(skillsDir, e.name))
      .filter((p) => fs.existsSync(path.join(p, "SKILL.md")));
    if (kids.length === 1) return kids[0];
    if (kids.length > 1) {
      throw new Error(
        `Multiple skills in repo; pass --path. Found: ${kids.map((k) => path.basename(k)).join(", ")}`,
      );
    }
  }

  // search one level
  const found: string[] = [];
  walk(repoRoot, 0, 3, (dir) => {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) found.push(dir);
  });
  if (found.length === 1) return found[0];
  if (found.length > 1) {
    throw new Error(
      `Multiple SKILL.md found; pass --path. Candidates: ${found
        .slice(0, 8)
        .map((f) => path.relative(repoRoot, f))
        .join(", ")}`,
    );
  }
  throw new Error("No SKILL.md found in source");
}

function walk(dir: string, depth: number, max: number, visit: (d: string) => void): void {
  if (depth > max) return;
  visit(dir);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === ".git" || e.name === "node_modules") continue;
    walk(path.join(dir, e.name), depth + 1, max, visit);
  }
}

function looksLikeGit(s: string): boolean {
  return (
    s.startsWith("git@") ||
    s.startsWith("https://") ||
    s.startsWith("http://") ||
    s.startsWith("ssh://") ||
    s.endsWith(".git")
  );
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16);
}
