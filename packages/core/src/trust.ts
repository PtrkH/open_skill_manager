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

export function isVerifiedSource(source: string | undefined, trusted: string[]): boolean {
  if (!source) return false;
  const normalized = source.replace(/\.git$/, "").toLowerCase();
  return trusted.some((t) => normalized.includes(t.replace(/\.git$/, "").toLowerCase()));
}

export function trustForSource(
  source: string | undefined,
  trusted: string[],
  blocked: string[] = [],
): TrustTier {
  if (!source) return "unverified";
  const n = source.toLowerCase();
  if (blocked.some((b) => n.includes(b.toLowerCase()))) return "blocked";
  if (isVerifiedSource(source, trusted)) return "verified";
  return "unverified";
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
