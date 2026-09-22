export type AgentId = "claude" | "codex" | "cursor" | "opencode" | "pi";

export const AGENTS: AgentId[] = ["claude", "codex", "cursor", "opencode", "pi"];

export const AGENT_LABELS: Record<AgentId, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
  pi: "Pi",
};

export type TrustTier = "verified" | "unverified" | "blocked";

export type InstallMode = "symlink" | "copy";

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  "allowed-tools"?: string;
  "disable-model-invocation"?: boolean;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
  path: string;
}

export interface ScanFinding {
  kind: "info" | "warn" | "danger";
  message: string;
}

export interface SkillScanResult {
  ok: boolean;
  findings: ScanFinding[];
  hasScripts: boolean;
}

export interface SkillRecord {
  name: string;
  description: string;
  version: string;
  source?: string;
  trust: TrustTier;
  hold?: boolean;
  installMode?: InstallMode;
}

export interface SkillEnablement {
  agents: AgentId[];
  /** Repo ids (registered paths) where this skill is enabled */
  repos: string[];
}

export interface RegisteredRepo {
  id: string;
  path: string;
  name: string;
}

export interface OsmState {
  version: 1;
  repos: RegisteredRepo[];
  skills: Record<string, SkillRecord>;
  enabled: Record<string, SkillEnablement>;
  trustedSources: string[];
  blockedSources: string[];
}

export interface InstalledLocation {
  agent: AgentId | "shared";
  scope: "global" | "project";
  root: string;
  skillPath: string;
  name: string;
  viaSymlink: boolean;
  target?: string;
  repoId?: string;
}

export interface SkillStatus {
  name: string;
  description: string;
  version: string | null;
  inStore: boolean;
  trust: TrustTier;
  hold: boolean;
  source?: string;
  agents: Record<AgentId, boolean>;
  repos: Record<string, boolean>;
  orphanLocations: InstalledLocation[];
}

export interface DoctorIssue {
  severity: "info" | "warn" | "error";
  message: string;
  skill?: string;
  path?: string;
}

export interface CatalogSource {
  id: string;
  name: string;
  repo: string;
  trust: TrustTier;
  skillsPath: string;
  description: string;
}

export interface CatalogSkill {
  name: string;
  description: string;
  sourceId: string;
  path: string;
}

export interface VerifiedCatalog {
  sources: CatalogSource[];
  skills: CatalogSkill[];
}
