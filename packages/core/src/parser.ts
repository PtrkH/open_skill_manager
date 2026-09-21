import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import type { ParsedSkill, SkillFrontmatter } from "./types.js";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class SkillParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillParseError";
  }
}

export function parseSkillMarkdown(content: string, filePath = "SKILL.md"): ParsedSkill {
  const trimmed = content.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) {
    throw new SkillParseError(`${filePath}: missing YAML frontmatter`);
  }
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) {
    throw new SkillParseError(`${filePath}: unterminated YAML frontmatter`);
  }
  const yamlBlock = trimmed.slice(3, end).trim();
  const body = trimmed.slice(end + 4).replace(/^\n/, "");

  let raw: unknown;
  try {
    raw = YAML.parse(yamlBlock);
  } catch (err) {
    throw new SkillParseError(
      `${filePath}: invalid YAML — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SkillParseError(`${filePath}: frontmatter must be a mapping`);
  }

  const fm = raw as Record<string, unknown>;
  const name = String(fm.name ?? "").trim();
  const description = String(fm.description ?? "").trim();

  if (!name) throw new SkillParseError(`${filePath}: name is required`);
  if (name.length > 64) throw new SkillParseError(`${filePath}: name max 64 chars`);
  if (!NAME_RE.test(name)) {
    throw new SkillParseError(
      `${filePath}: name must be lowercase alphanumeric with single hyphens`,
    );
  }
  if (!description) throw new SkillParseError(`${filePath}: description is required`);
  if (description.length > 1024) {
    throw new SkillParseError(`${filePath}: description max 1024 chars`);
  }

  const frontmatter: SkillFrontmatter = { name, description };
  if (typeof fm.license === "string") frontmatter.license = fm.license;
  if (typeof fm.compatibility === "string") frontmatter.compatibility = fm.compatibility;
  if (fm.metadata && typeof fm.metadata === "object" && !Array.isArray(fm.metadata)) {
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(fm.metadata as Record<string, unknown>)) {
      if (v != null) meta[k] = String(v);
    }
    frontmatter.metadata = meta;
  }
  if (typeof fm["allowed-tools"] === "string") {
    frontmatter["allowed-tools"] = fm["allowed-tools"];
  }
  if (typeof fm["disable-model-invocation"] === "boolean") {
    frontmatter["disable-model-invocation"] = fm["disable-model-invocation"];
  }

  return { frontmatter, body, path: filePath };
}

export function readSkillDir(skillDir: string): ParsedSkill {
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    throw new SkillParseError(`No SKILL.md in ${skillDir}`);
  }
  const content = fs.readFileSync(skillMd, "utf8");
  const parsed = parseSkillMarkdown(content, skillMd);
  const dirName = path.basename(skillDir);
  // Soft check: warn via throw only if clearly wrong for strict agents
  if (dirName !== parsed.frontmatter.name && dirName !== ".") {
    // Allow mismatch for import; callers can validate strictly
  }
  return parsed;
}

export function validateSkillDir(skillDir: string, strictNameMatch = false): ParsedSkill {
  const parsed = readSkillDir(skillDir);
  if (strictNameMatch) {
    const dirName = path.basename(path.resolve(skillDir));
    if (dirName !== parsed.frontmatter.name) {
      throw new SkillParseError(
        `Directory name "${dirName}" must match skill name "${parsed.frontmatter.name}"`,
      );
    }
  }
  return parsed;
}
