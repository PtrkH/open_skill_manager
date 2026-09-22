import { Command } from "commander";
import path from "node:path";
import {
  AGENTS,
  AGENT_LABELS,
  OpenSkillManager,
  type AgentId,
} from "@osm/core";
import { startUiServer } from "./server.js";

const program = new Command();
program
  .name("osm")
  .description("Open Skill Manager — sync Agent Skills across Claude, Codex, OpenCode, Pi, and Cursor")
  .version("0.1.0");

function mgr() {
  return new OpenSkillManager();
}

function parseAgents(raw?: string): AgentId[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim().toLowerCase());
  const out: AgentId[] = [];
  for (const p of parts) {
    if (!(AGENTS as string[]).includes(p)) {
      throw new Error(`Unknown agent "${p}". Use: ${AGENTS.join(", ")}`);
    }
    out.push(p as AgentId);
  }
  return out;
}

program
  .command("scan")
  .description("Scan disk for installed skills")
  .option("--import", "Import orphans into the OSM store")
  .action((opts: { import?: boolean }) => {
    const m = mgr();
    if (opts.import) {
      const result = m.importOrphans();
      console.log(`Imported: ${result.imported.join(", ") || "(none)"}`);
      console.log(`Skipped: ${result.skipped.join(", ") || "(none)"}`);
      return;
    }
    const locs = m.scan();
    if (locs.length === 0) {
      console.log("No skills found on disk.");
      return;
    }
    for (const loc of locs) {
      const scope = loc.repoId ? `repo:${loc.repoId}` : loc.scope;
      console.log(
        `${loc.name.padEnd(28)} ${String(loc.agent).padEnd(10)} ${scope.padEnd(16)} ${loc.viaSymlink ? "link" : "copy"}  ${loc.skillPath}`,
      );
    }
  });

program
  .command("list")
  .description("List skills with per-agent and per-repo coverage")
  .action(() => {
    const statuses = mgr().listStatuses();
    if (statuses.length === 0) {
      console.log("No skills yet. Try: osm install <path> && osm enable <name>");
      return;
    }
    const header =
      "SKILL".padEnd(24) +
      "VER".padEnd(14) +
      "TRUST".padEnd(12) +
      AGENTS.map((a) => a.slice(0, 3).toUpperCase().padEnd(4)).join("") +
      " REPOS";
    console.log(header);
    for (const s of statuses) {
      const toggles = AGENTS.map((a) => (s.agents[a] ? " ●  " : " ·  ")).join("");
      const repos = Object.entries(s.repos)
        .filter(([, on]) => on)
        .map(([id]) => id)
        .join(",") || "-";
      console.log(
        s.name.padEnd(24) +
          (s.version ?? "-").slice(0, 12).padEnd(14) +
          s.trust.padEnd(12) +
          toggles +
          " " +
          repos,
      );
    }
    console.log("\nAgents: " + AGENTS.map((a) => `${a.slice(0, 3).toUpperCase()}=${AGENT_LABELS[a]}`).join("  "));
  });

program
  .command("install")
  .description("Install a skill from a local path or git URL into the store")
  .argument("<source>", "Local path or git URL")
  .option("--path <subpath>", "Subpath inside a git repo")
  .option("--force", "Allow unverified skills with scripts / scan warnings")
  .action((source: string, opts: { path?: string; force?: boolean }) => {
    const result = mgr().install(source, {
      subpath: opts.path,
      forceUnverified: Boolean(opts.force),
    });
    console.log(`Installed ${result.name}@${result.version} (${result.trust})`);
    console.log(`Store: ${result.path}`);
    if (result.scan.findings.length) {
      for (const f of result.scan.findings) {
        console.log(`  [${f.kind}] ${f.message}`);
      }
    }
    console.log(`Enable with: osm enable ${result.name}`);
  });

program
  .command("uninstall")
  .description("Disable everywhere and remove from the store")
  .argument("<name>")
  .action((name: string) => {
    mgr().uninstall(name);
    console.log(`Uninstalled ${name}`);
  });

program
  .command("enable")
  .description("Enable a skill for agents and/or repos")
  .argument("<name>")
  .option("-a, --agents <list>", `Comma-separated agents (${AGENTS.join(",")})`)
  .option("--all", "Enable for all supported agents")
  .option("-r, --repo <id>", "Also enable in a registered repo (repeatable)", collect, [])
  .action((name: string, opts: { agents?: string; all?: boolean; repo: string[] }) => {
    const agents = parseAgents(opts.agents);
    if (!opts.all && !agents?.length && !opts.repo.length) {
      console.error(
        `Specify agents with -a/--agents (${AGENTS.join(",")}), --all, and/or -r/--repo.`,
      );
      process.exitCode = 1;
      return;
    }
    mgr().enable(name, {
      agents,
      allAgents: Boolean(opts.all),
      repos: opts.repo,
      repoOnly: Boolean(opts.repo.length && !opts.all && !agents?.length),
    });
    const who = opts.all
      ? "all agents"
      : agents?.length
        ? agents.join(",")
        : "repo only";
    console.log(`Enabled ${name} (${who})`);
    if (opts.repo.length) console.log(`Repos: ${opts.repo.join(", ")}`);
  });

program
  .command("disable")
  .description("Disable a skill for agents and/or repos (keeps store copy)")
  .argument("<name>")
  .option("-a, --agents <list>", "Comma-separated agents (default: all agents if no repo flags)")
  .option("-r, --repo <id>", "Disable in repo", collect, [])
  .option("--all-repos", "Disable in all registered repos")
  .action((name: string, opts: { agents?: string; repo: string[]; allRepos?: boolean }) => {
    const agents = parseAgents(opts.agents);
    const hasRepoScope = opts.repo.length > 0 || Boolean(opts.allRepos);
    const disableEverything = !opts.agents && !hasRepoScope;
    mgr().disable(name, {
      agents: disableEverything ? undefined : agents,
      allAgents: disableEverything,
      repos: opts.repo,
      allRepos: opts.allRepos || disableEverything,
    });
    console.log(`Disabled ${name}`);
  });

program
  .command("update")
  .description("Re-fetch a skill from its recorded source")
  .argument("<name>")
  .option("--force", "Update even if on hold")
  .action((name: string, opts: { force?: boolean }) => {
    const result = mgr().update(name, { force: opts.force });
    console.log(`Updated ${result.name}@${result.version}`);
  });

program
  .command("doctor")
  .description("Explain conflicts and missing store entries")
  .action(() => {
    for (const issue of mgr().doctor()) {
      console.log(`[${issue.severity}] ${issue.message}`);
    }
  });

program
  .command("discover")
  .description("Search the verified skill catalog")
  .argument("[query]", "Optional search string")
  .action((query?: string) => {
    const hits = mgr().discover(query ?? "");
    if (!hits.length) {
      console.log("No catalog matches.");
      return;
    }
    for (const s of hits) {
      console.log(`${s.name.padEnd(24)} [${s.source.trust}] ${s.description}`);
      console.log(`  source: ${s.source.repo}  path: ${s.path}`);
    }
  });

const repoCmd = program.command("repo").description("Manage registered repositories");

repoCmd
  .command("add")
  .argument("<path>")
  .option("-n, --name <name>", "Display name")
  .action((repoPath: string, opts: { name?: string }) => {
    const repo = mgr().addRepo(path.resolve(repoPath), opts.name);
    console.log(`Registered ${repo.id} → ${repo.path}`);
  });

repoCmd
  .command("remove")
  .argument("<idOrPath>")
  .action((id: string) => {
    const ok = mgr().removeRepo(id);
    console.log(ok ? `Removed ${id}` : `Not found: ${id}`);
  });

repoCmd
  .command("list")
  .action(() => {
    const repos = mgr().listRepos();
    if (!repos.length) {
      console.log("No repos registered. osm repo add <path>");
      return;
    }
    for (const r of repos) {
      console.log(`${r.id.padEnd(20)} ${r.path}`);
    }
  });

repoCmd
  .command("status")
  .argument("<id>")
  .action((id: string) => {
    const m = mgr();
    const repo = m.listRepos().find((r) => r.id === id || r.path === id);
    if (!repo) {
      console.error(`Unknown repo: ${id}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${repo.name} (${repo.path})\n`);
    for (const s of m.listStatuses()) {
      const on = s.repos[repo.id];
      const globalOn = AGENTS.filter((a) => s.agents[a]).map((a) => a).join(",") || "-";
      console.log(`${on ? "●" : "·"} ${s.name.padEnd(24)} global:[${globalOn}]`);
    }
  });

repoCmd
  .command("align")
  .argument("<id>")
  .description("Mirror globally-enabled skills into this repo")
  .action((id: string) => {
    const result = mgr().alignRepo(id);
    console.log(`Enabled: ${result.enabled.join(", ") || "(none)"}`);
    console.log(`Disabled orphans: ${result.disabled.join(", ") || "(none)"}`);
  });

repoCmd
  .command("clean")
  .argument("<id>")
  .description("Remove all project skill links in this repo")
  .action((id: string) => {
    const removed = mgr().cleanRepo(id);
    console.log(`Removed: ${removed.join(", ") || "(none)"}`);
  });

program
  .command("ui")
  .description("Open the local dark web UI on 127.0.0.1")
  .option("-p, --port <port>", "Port", "8787")
  .option("--no-open", "Do not open a browser")
  .action(async (opts: { port: string; open: boolean }) => {
    const port = Number(opts.port);
    await startUiServer({ port, openBrowser: opts.open });
  });

function collect(value: string, prev: string[]) {
  prev.push(value);
  return prev;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
