import fs from "node:fs";
import {
  AGENTS,
  AGENT_LABELS,
  type AgentId,
  type DoctorIssue,
  type SkillStatus,
  type TrustTier,
} from "./types.js";
import { homeDir } from "./paths.js";
import {
  getEnablement,
  loadState,
  registerRepo,
  saveState,
  setEnablement,
  unregisterRepo,
  upsertSkillRecord,
} from "./state.js";
import {
  getCurrentVersion,
  installSkillToStore,
  listStoredVersions,
  resolveCurrentSkillPath,
  setCurrentVersion,
  uninstallFromStore,
} from "./store.js";
import {
  disableForAgent,
  disableForRepo,
  enableForAgent,
  enableForRepo,
  isEnabledForAgent,
  isEnabledInRepo,
} from "./adapters.js";
import { scanAll } from "./scanner.js";
import { fetchSkillSource } from "./fetch.js";
import { readSkillDir } from "./parser.js";
import { scanSkillDir, trustForSource } from "./trust.js";
import { loadVerifiedCatalog, searchCatalog } from "./catalog.js";

export interface OsmOptions {
  home?: string;
}

export class OpenSkillManager {
  readonly home: string;

  constructor(opts: OsmOptions = {}) {
    this.home = opts.home ?? homeDir();
  }

  private state() {
    return loadState(this.home);
  }

  private persist(state: ReturnType<typeof loadState>) {
    saveState(state, this.home);
  }

  scan() {
    const state = this.state();
    return scanAll(state.repos, this.home);
  }

  listStatuses(): SkillStatus[] {
    const state = this.state();
    const locations = this.scan();
    const names = new Set<string>([
      ...Object.keys(state.skills),
      ...locations.map((l) => l.name),
    ]);

    const statuses: SkillStatus[] = [];
    for (const name of [...names].sort()) {
      statuses.push(this.statusFor(name, locations));
    }
    return statuses;
  }

  statusFor(name: string, prefetchedScan?: ReturnType<OpenSkillManager["scan"]>): SkillStatus {
    const state = this.state();
    const record = state.skills[name];
    const version = getCurrentVersion(name, this.home);
    const inStore = Boolean(version);
    // Disk is source of truth for whether an agent currently has the skill
    const agents = {} as Record<AgentId, boolean>;
    for (const agent of AGENTS) {
      agents[agent] = isEnabledForAgent(agent, name, { home: this.home });
    }
    const repos: Record<string, boolean> = {};
    for (const repo of state.repos) {
      repos[repo.id] = AGENTS.some((a) => isEnabledInRepo(repo.path, a, name));
    }

    const locations = prefetchedScan ?? this.scan();
    const orphanLocations = locations.filter(
      (l) => l.name === name && !inStore && !l.viaSymlink,
    );

    return {
      name,
      description: record?.description ?? tryDescription(name, this.home) ?? "",
      version: version ?? record?.version ?? null,
      inStore,
      trust: record?.trust ?? "unverified",
      hold: Boolean(record?.hold),
      source: record?.source,
      agents,
      repos,
      orphanLocations,
    };
  }

  /** Import on-disk skills into the store so first launch shows reality. */
  importOrphans(): { imported: string[]; skipped: string[] } {
    const state = this.state();
    const imported: string[] = [];
    const skipped: string[] = [];
    const seen = new Set<string>();

    for (const loc of this.scan()) {
      if (seen.has(loc.name)) continue;
      seen.add(loc.name);
      if (resolveCurrentSkillPath(loc.name, this.home)) {
        skipped.push(loc.name);
        continue;
      }
      try {
        const real = fs.realpathSync(loc.skillPath);
        const parsed = readSkillDir(real);
        const { name, version } = installSkillToStore(real, { home: this.home });
        upsertSkillRecord(state, {
          name,
          description: parsed.frontmatter.description,
          version,
          trust: "unverified",
          source: real,
        });
        // Re-link from store for agents that already have it
        for (const agent of AGENTS) {
          if (isEnabledForAgent(agent, name, { home: this.home })) {
            const storePath = resolveCurrentSkillPath(name, this.home)!;
            enableForAgent(agent, name, storePath, { home: this.home });
            const en = getEnablement(state, name);
            if (!en.agents.includes(agent)) en.agents.push(agent);
            setEnablement(state, name, en);
          }
        }
        for (const repo of state.repos) {
          if (AGENTS.some((a) => isEnabledInRepo(repo.path, a, name))) {
            const storePath = resolveCurrentSkillPath(name, this.home)!;
            for (const agent of AGENTS) {
              if (isEnabledInRepo(repo.path, agent, name)) {
                enableForRepo(repo.path, agent, name, storePath);
              }
            }
            const en = getEnablement(state, name);
            if (!en.repos.includes(repo.id)) en.repos.push(repo.id);
            setEnablement(state, name, en);
          }
        }
        imported.push(name);
      } catch {
        skipped.push(loc.name);
      }
    }
    this.persist(state);
    return { imported, skipped };
  }

  install(
    source: string,
    opts: {
      subpath?: string;
      version?: string;
      forceUnverified?: boolean;
      trust?: TrustTier;
    } = {},
  ) {
    const state = this.state();
    const fetched = fetchSkillSource(source, { subpath: opts.subpath, home: this.home });
    const scan = scanSkillDir(fetched.skillDir);
    const trust =
      opts.trust ??
      trustForSource(fetched.source, state.trustedSources, state.blockedSources);

    if (trust === "blocked") {
      throw new Error("Source is blocked");
    }
    if (!scan.ok && !opts.forceUnverified) {
      throw new Error(
        `Refusing to install — scan failed:\n${scan.findings.map((f) => `- [${f.kind}] ${f.message}`).join("\n")}`,
      );
    }
    if (trust === "unverified" && scan.hasScripts && !opts.forceUnverified) {
      throw new Error(
        "Unverified skill includes scripts/. Re-run with --force to install anyway.",
      );
    }

    const parsed = readSkillDir(fetched.skillDir);
    const { name, version, path: storePath } = installSkillToStore(fetched.skillDir, {
      home: this.home,
      version: opts.version,
    });
    upsertSkillRecord(state, {
      name,
      description: parsed.frontmatter.description,
      version,
      source: fetched.source,
      trust,
    });
    this.persist(state);
    return { name, version, path: storePath, trust, scan };
  }

  uninstall(name: string) {
    const state = this.state();
    for (const agent of AGENTS) {
      disableForAgent(agent, name, { home: this.home });
    }
    for (const repo of state.repos) {
      for (const agent of AGENTS) {
        disableForRepo(repo.path, agent, name);
      }
    }
    uninstallFromStore(name, this.home);
    delete state.skills[name];
    delete state.enabled[name];
    this.persist(state);
  }

  enable(
    name: string,
    opts: {
      agents?: AgentId[];
      repos?: string[];
      allAgents?: boolean;
      /** Only link into repos — do not change global agent enables */
      repoOnly?: boolean;
    } = {},
  ) {
    const state = this.state();
    const storePath = resolveCurrentSkillPath(name, this.home);
    if (!storePath) throw new Error(`Skill "${name}" is not in the store. Install or import first.`);

    const en = getEnablement(state, name);
    const agents = opts.allAgents
      ? [...AGENTS]
      : (opts.agents ?? (opts.repoOnly ? (en.agents.length ? [...en.agents] : [...AGENTS]) : [...AGENTS]));

    if (!opts.repoOnly) {
      for (const agent of agents) {
        enableForAgent(agent, name, storePath, { home: this.home });
        if (!en.agents.includes(agent)) en.agents.push(agent);
      }
    }

    const repoIds = opts.repos ?? [];
    for (const repoId of repoIds) {
      const repo = state.repos.find((r) => r.id === repoId || r.path === repoId);
      if (!repo) throw new Error(`Unknown repo: ${repoId}`);
      for (const agent of agents) {
        enableForRepo(repo.path, agent, name, storePath);
      }
      if (!en.repos.includes(repo.id)) en.repos.push(repo.id);
    }

    setEnablement(state, name, en);
    if (!state.skills[name]) {
      const parsed = readSkillDir(storePath);
      upsertSkillRecord(state, {
        name,
        description: parsed.frontmatter.description,
        version: getCurrentVersion(name, this.home) ?? "unknown",
        trust: "unverified",
      });
    }
    this.persist(state);
    return en;
  }

  disable(name: string, opts: { agents?: AgentId[]; repos?: string[]; allAgents?: boolean; allRepos?: boolean } = {}) {
    const state = this.state();
    const en = getEnablement(state, name);
    const disableAllAgents =
      opts.allAgents || (!opts.agents?.length && !opts.repos?.length && !opts.allRepos);
    const agents = disableAllAgents ? [...AGENTS] : (opts.agents ?? []);

    for (const agent of agents) {
      disableForAgent(agent, name, { home: this.home });
      en.agents = en.agents.filter((a) => a !== agent);
    }

    const repoTargets = opts.allRepos
      ? state.repos
      : (opts.repos ?? []).map((id) => {
          const repo = state.repos.find((r) => r.id === id || r.path === id);
          if (!repo) throw new Error(`Unknown repo: ${id}`);
          return repo;
        });

    for (const repo of repoTargets) {
      for (const agent of AGENTS) {
        disableForRepo(repo.path, agent, name);
      }
      en.repos = en.repos.filter((id) => id !== repo.id);
    }

    setEnablement(state, name, en);
    this.persist(state);
    return en;
  }

  enableInRepo(name: string, repoId: string, agents?: AgentId[]) {
    return this.enable(name, { agents, repos: [repoId], repoOnly: true });
  }

  disableInRepo(name: string, repoId: string) {
    return this.disable(name, { agents: [], repos: [repoId] });
  }

  alignRepo(repoId: string): { enabled: string[]; disabled: string[] } {
    const state = this.state();
    const repo = state.repos.find((r) => r.id === repoId || r.path === repoId);
    if (!repo) throw new Error(`Unknown repo: ${repoId}`);

    const enabled: string[] = [];
    const disabled: string[] = [];

    // Enable skills that are globally enabled for any agent
    for (const [name, en] of Object.entries(state.enabled)) {
      if (en.agents.length === 0) continue;
      const storePath = resolveCurrentSkillPath(name, this.home);
      if (!storePath) continue;
      for (const agent of en.agents) {
        enableForRepo(repo.path, agent, name, storePath);
      }
      if (!en.repos.includes(repo.id)) en.repos.push(repo.id);
      setEnablement(state, name, en);
      enabled.push(name);
    }

    // Disable skills present in repo but not in global enablement
    for (const loc of scanAll([repo], this.home)) {
      if (loc.scope !== "project") continue;
      const en = getEnablement(state, loc.name);
      if (en.agents.length === 0) {
        for (const agent of AGENTS) {
          disableForRepo(repo.path, agent, loc.name);
        }
        en.repos = en.repos.filter((id) => id !== repo.id);
        setEnablement(state, loc.name, en);
        disabled.push(loc.name);
      }
    }

    this.persist(state);
    return { enabled: [...new Set(enabled)], disabled: [...new Set(disabled)] };
  }

  cleanRepo(repoId: string): string[] {
    const state = this.state();
    const repo = state.repos.find((r) => r.id === repoId || r.path === repoId);
    if (!repo) throw new Error(`Unknown repo: ${repoId}`);
    const removed: string[] = [];
    for (const loc of scanAll([repo], this.home)) {
      if (loc.scope !== "project") continue;
      for (const agent of AGENTS) {
        disableForRepo(repo.path, agent, loc.name);
      }
      const en = getEnablement(state, loc.name);
      en.repos = en.repos.filter((id) => id !== repo.id);
      setEnablement(state, loc.name, en);
      removed.push(loc.name);
    }
    this.persist(state);
    return [...new Set(removed)];
  }

  addRepo(repoPath: string, name?: string) {
    const state = this.state();
    if (!fs.existsSync(repoPath)) throw new Error(`Path does not exist: ${repoPath}`);
    const repo = registerRepo(state, repoPath, name);
    this.persist(state);
    return repo;
  }

  removeRepo(idOrPath: string) {
    const state = this.state();
    const ok = unregisterRepo(state, idOrPath);
    this.persist(state);
    return ok;
  }

  listRepos() {
    return this.state().repos;
  }

  setHold(name: string, hold: boolean) {
    const state = this.state();
    if (!state.skills[name]) throw new Error(`Unknown skill: ${name}`);
    state.skills[name].hold = hold;
    this.persist(state);
  }

  update(name: string, opts: { force?: boolean } = {}) {
    const state = this.state();
    const record = state.skills[name];
    if (!record) throw new Error(`Unknown skill: ${name}`);
    if (record.hold && !opts.force) {
      throw new Error(`Skill "${name}" is on hold. Pass --force to update.`);
    }
    if (!record.source) throw new Error(`No source recorded for "${name}"`);
    return this.install(record.source, {
      forceUnverified: Boolean(opts.force),
      trust: record.trust,
    });
  }

  versions(name: string) {
    return {
      current: getCurrentVersion(name, this.home),
      versions: listStoredVersions(name, this.home),
    };
  }

  useVersion(name: string, version: string) {
    setCurrentVersion(name, version, this.home);
    const state = this.state();
    const storePath = resolveCurrentSkillPath(name, this.home)!;
    const en = getEnablement(state, name);
    for (const agent of en.agents) {
      enableForAgent(agent, name, storePath, { home: this.home });
    }
    for (const repoId of en.repos) {
      const repo = state.repos.find((r) => r.id === repoId);
      if (!repo) continue;
      for (const agent of en.agents.length ? en.agents : AGENTS) {
        enableForRepo(repo.path, agent, name, storePath);
      }
    }
    if (state.skills[name]) state.skills[name].version = version;
    this.persist(state);
  }

  doctor(): DoctorIssue[] {
    const issues: DoctorIssue[] = [];
    const state = this.state();
    const byName = new Map<string, string[]>();

    for (const loc of this.scan()) {
      const list = byName.get(loc.name) ?? [];
      list.push(loc.skillPath);
      byName.set(loc.name, list);
    }

    for (const [name, paths] of byName) {
      const unique = [...new Set(paths.map((p) => {
        try {
          return fs.realpathSync(p);
        } catch {
          return p;
        }
      }))];
      if (unique.length > 1) {
        issues.push({
          severity: "warn",
          skill: name,
          message: `Skill "${name}" resolves to multiple different paths (${unique.length}). Agents may see inconsistent instructions.`,
          path: unique.join(", "),
        });
      }
      if (!resolveCurrentSkillPath(name, this.home)) {
        issues.push({
          severity: "info",
          skill: name,
          message: `Skill "${name}" is on disk but not in the OSM store. Run osm scan --import.`,
        });
      }
    }

    for (const agent of AGENTS) {
      const label = AGENT_LABELS[agent];
      // just note missing primary root is fine
      void label;
    }

    for (const repo of state.repos) {
      if (!fs.existsSync(repo.path)) {
        issues.push({
          severity: "error",
          message: `Registered repo "${repo.name}" path missing: ${repo.path}`,
          path: repo.path,
        });
      }
    }

    if (issues.length === 0) {
      issues.push({ severity: "info", message: "No issues found." });
    }
    return issues;
  }

  discover(query = "") {
    return searchCatalog(loadVerifiedCatalog(), query);
  }

  catalog() {
    return loadVerifiedCatalog();
  }

  skillDetail(name: string) {
    const status = this.statusFor(name);
    const storePath = resolveCurrentSkillPath(name, this.home);
    const vers = this.versions(name);
    let body = "";
    let license: string | undefined;
    let compatibility: string | undefined;
    let allowedTools: string | undefined;
    if (storePath) {
      try {
        const parsed = readSkillDir(storePath);
        body = parsed.body.trim();
        license = parsed.frontmatter.license;
        compatibility = parsed.frontmatter.compatibility;
        allowedTools = parsed.frontmatter["allowed-tools"];
      } catch {
        /* ignore */
      }
    }
    return {
      ...status,
      storePath,
      versions: vers.versions,
      currentVersion: vers.current,
      license,
      compatibility,
      allowedTools,
      body,
      bodyPreview: body.slice(0, 1200),
    };
  }

  snapshot() {
    return {
      skills: this.listStatuses(),
      repos: this.listRepos(),
      catalog: this.catalog(),
      agents: AGENTS.map((id) => ({ id, label: AGENT_LABELS[id] })),
    };
  }
}

function tryDescription(name: string, home: string): string | null {
  const p = resolveCurrentSkillPath(name, home);
  if (!p) return null;
  try {
    return readSkillDir(p).frontmatter.description;
  } catch {
    return null;
  }
}
