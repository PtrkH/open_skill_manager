import fs from "node:fs";
import path from "node:path";
import type { SkillScanResult, TrustTier } from "./types.js";

const DANGEROUS_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /curl\s+[^\n]*\|\s*(ba)?sh/i, message: "Pipeline curl|bash detected in scripts" },
  { re: /wget\s+[^\n]*\|\s*(ba)?sh/i, message: "Pipeline wget|bash detected in scripts" },
  { re: /rm\s+-rf\s+\/(?!\w)/i, message: "Destructive rm -rf / pattern detected" },
  {
    re: /eval\s*\(|new\s+Function\s*\(/i,
    message: "Dynamic code evaluation detected",
  },
];

/** Normalize a source to comparable github.com/org/repo (or file path). */
export function canonicalizeSource(source: string): string {
  const trimmed = source.trim().replace(/\.git$/, "");
  const ssh = trimmed.match(/^git@([^:]+):(.+)$/i);
  if (ssh) {
    return `${ssh[1].toLowerCase()}/${ssh[2].replace(/^\/+/, "").toLowerCase()}`;
  }
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
      const repoPath = parts.slice(0, 2).join("/");
      return `${u.hostname.toLowerCase()}/${repoPath.toLowerCase()}`;
    }
  } catch {
    /* fall through */
  }
  return path.resolve(trimmed).toLowerCase();
}

export function isVerifiedSource(source: string | undefined, trusted: string[]): boolean {
  if (!source) return false;
  // Local paths are never "verified" via allowlist
  if (!looksLikeRemote(source)) return false;
  const canon = canonicalizeSource(source);
  return trusted.some((t) => {
    const trustCanon = canonicalizeSource(
      t.includes("://") || t.startsWith("git@") ? t : `https://${t}`,
    );
    return canon === trustCanon || canon.startsWith(`${trustCanon}/`);
  });
}

export function trustForSource(
  source: string | undefined,
  trusted: string[],
  blocked: string[] = [],
): TrustTier {
  if (!source) return "unverified";
  if (looksLikeRemote(source)) {
    const canon = canonicalizeSource(source);
    if (
      blocked.some((b) => {
        const bCanon = canonicalizeSource(
          b.includes("://") || b.startsWith("git@") ? b : `https://${b}`,
        );
        return canon === bCanon || canon.startsWith(`${bCanon}/`);
      })
    ) {
      return "blocked";
    }
  }
  if (isVerifiedSource(source, trusted)) return "verified";
  return "unverified";
}

function looksLikeRemote(s: string): boolean {
  return (
    /^https?:\/\//i.test(s) ||
    s.startsWith("git@") ||
    s.startsWith("ssh://") ||
    s.endsWith(".git")
  );
}

export function scanSkillDir(skillDir: string): SkillScanResult {
  const findings: SkillScanResult["findings"] = [];
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    return {
      ok: false,
      findings: [{ kind: "danger", message: "Missing SKILL.md" }],
      hasScripts: false,
    };
  }

  let hasScripts = false;
  const scriptsDir = path.join(skillDir, "scripts");
  if (fs.existsSync(scriptsDir)) {
    hasScripts = true;
    findings.push({ kind: "info", message: "Skill includes a scripts/ directory" });
    walkFiles(scriptsDir, (file, content) => {
      for (const { re, message } of DANGEROUS_PATTERNS) {
        if (re.test(content)) {
          findings.push({ kind: "danger", message: `${message} (${path.relative(skillDir, file)})` });
        }
      }
    });
  }

  try {
    const md = fs.readFileSync(skillMd, "utf8");
    if (/allowed-tools:\s*.+/i.test(md) && /Bash\(\*\)|Shell\(\*\)|\*/.test(md)) {
      findings.push({
        kind: "warn",
        message: "Broad allowed-tools permissions declared in frontmatter",
      });
    }
  } catch {
    findings.push({ kind: "warn", message: "Could not read SKILL.md for permission scan" });
  }

  const ok = !findings.some((f) => f.kind === "danger");
  return { ok, findings, hasScripts };
}

function walkFiles(dir: string, visit: (file: string, content: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, visit);
    else if (entry.isFile()) {
      try {
        visit(full, fs.readFileSync(full, "utf8"));
      } catch {
        /* ignore unreadable */
      }
    }
  }
}
