import { useCallback, useEffect, useMemo, useState } from "react";
import "./app.css";

type AgentId = "claude" | "codex" | "cursor" | "opencode" | "pi";

interface SkillStatus {
  name: string;
  description: string;
  version: string | null;
  inStore: boolean;
  trust: string;
  hold: boolean;
  source?: string;
  agents: Record<AgentId, boolean>;
  repos: Record<string, boolean>;
}

interface Repo {
  id: string;
  path: string;
  name: string;
}

interface Snapshot {
  skills: SkillStatus[];
  repos: Repo[];
  agents: Array<{ id: AgentId; label: string }>;
  catalog: {
    sources: Array<{ id: string; name: string; repo: string; description: string }>;
    skills: Array<{ name: string; description: string; sourceId: string; path: string }>;
  };
}

type Tab = "skills" | "repos" | "discover";

const TAB_META: Record<Tab, { title: string; blurb: string }> = {
  skills: { title: "Skills", blurb: "What each agent can load" },
  repos: { title: "Repos", blurb: "Project-scoped skill links" },
  discover: { title: "Discover", blurb: "Verified sources only" },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
}

function IconSkills() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 3.5h10v2H3v-2Zm0 3.5h7v2H3V7Zm0 3.5h10v2H3v-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconRepos() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 4.5h4l1.2 1.2H13.5v6.3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V4.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
      />
    </svg>
  );
}

function IconDiscover() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.2 10.2 13.5 13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>("skills");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [discoverQ, setDiscoverQ] = useState("");

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await api<Snapshot>("/api/snapshot");
      setSnap(data);
      if (!selectedRepo && data.repos[0]) setSelectedRepo(data.repos[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedRepo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const agents = snap?.agents ?? [];
  const meta = TAB_META[tab];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <div className="brand">Open Skill Manager</div>
          </div>
          <p className="brand-sub">Beside Conductor · skills for every agent</p>
        </div>

        <nav className="nav">
          <button
            type="button"
            className={tab === "skills" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("skills")}
          >
            <IconSkills />
            <span className="nav-label">Skills</span>
            <span className="nav-count">{snap?.skills.length ?? "·"}</span>
          </button>
          <button
            type="button"
            className={tab === "repos" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("repos")}
          >
            <IconRepos />
            <span className="nav-label">Repos</span>
            <span className="nav-count">{snap?.repos.length ?? "·"}</span>
          </button>
          <button
            type="button"
            className={tab === "discover" ? "nav-item active" : "nav-item"}
            onClick={() => setTab("discover")}
          >
            <IconDiscover />
            <span className="nav-label">Discover</span>
            <span className="nav-count">{snap?.catalog.skills.length ?? "·"}</span>
          </button>
        </nav>

        <div className="sidebar-foot">
          <button className="ghost-sm" type="button" disabled={busy} onClick={() => void refresh()}>
            Refresh from disk
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="page-title">{meta.title}</div>
          <div className="page-meta">{meta.blurb}</div>
        </header>

        {error && <div className="banner">{error}</div>}

        <div className="content">
          {!snap && !error && <div className="empty">Loading…</div>}

          {tab === "skills" && snap && (
            <SkillsView
              snap={snap}
              agents={agents}
              expanded={expanded}
              setExpanded={setExpanded}
              busy={busy}
              installSource={installSource}
              setInstallSource={setInstallSource}
              run={run}
            />
          )}

          {tab === "repos" && snap && (
            <ReposView
              snap={snap}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              repoPath={repoPath}
              setRepoPath={setRepoPath}
              busy={busy}
              run={run}
            />
          )}

          {tab === "discover" && snap && (
            <DiscoverView
              snap={snap}
              query={discoverQ}
              setQuery={setDiscoverQ}
              busy={busy}
              run={run}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SkillsView({
  snap,
  agents,
  expanded,
  setExpanded,
  busy,
  installSource,
  setInstallSource,
  run,
}: {
  snap: Snapshot;
  agents: Snapshot["agents"];
  expanded: string | null;
  setExpanded: (n: string | null) => void;
  busy: boolean;
  installSource: string;
  setInstallSource: (s: string) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <section>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Install from local path or git URL…"
          value={installSource}
          onChange={(e) => setInstallSource(e.target.value)}
        />
        <button
          className="btn primary"
          type="button"
          disabled={busy || !installSource.trim()}
          onClick={() =>
            void run(() =>
              api("/api/install", {
                method: "POST",
                body: JSON.stringify({ source: installSource.trim() }),
              }),
            )
          }
        >
          Install
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={busy}
          onClick={() => void run(() => api("/api/scan/import", { method: "POST" }))}
        >
          Import orphans
        </button>
      </div>

      <div className="list">
        <div className="list-head">
          <span>Skill</span>
          <span>Version</span>
          <span>Trust</span>
          {agents.map((a) => (
            <span key={a.id} title={a.label} className="agent-h">
              {a.id.slice(0, 3)}
            </span>
          ))}
          <span>Repos</span>
        </div>

        {snap.skills.length === 0 && (
          <div className="empty">
            <strong>Nothing installed yet</strong>
            Install a skill or import what agents already have on disk.
          </div>
        )}

        {snap.skills.map((skill) => {
          const open = expanded === skill.name;
          const repoCount = Object.values(skill.repos).filter(Boolean).length;
          const enabledCount = agents.filter((a) => skill.agents[a.id]).length;
          return (
            <div key={skill.name} className={open ? "row open" : "row"}>
              <button
                type="button"
                className="row-main"
                onClick={() => setExpanded(open ? null : skill.name)}
              >
                <span className="skill-name">
                  <strong>{skill.name}</strong>
                  <span className="hint">
                    {enabledCount}/{agents.length} agents
                    {skill.description ? ` · ${skill.description}` : ""}
                  </span>
                </span>
                <span className="mono muted">{skill.version ?? "—"}</span>
                <span className={`pill ${skill.trust}`}>{skill.trust}</span>
                {agents.map((a) => (
                  <span key={a.id} className={skill.agents[a.id] ? "dot on" : "dot"} />
                ))}
                <span className="muted">{repoCount || "—"}</span>
              </button>

              {open && (
                <div className="detail">
                  <p className="detail-desc">{skill.description || "No description"}</p>

                  <div className="section-label">Agents</div>
                  <div className="switch-grid">
                    {agents.map((a) => (
                      <label key={a.id} className="switch">
                        <input
                          type="checkbox"
                          checked={Boolean(skill.agents[a.id])}
                          disabled={busy || !skill.inStore}
                          onChange={(e) => {
                            const on = e.target.checked;
                            void run(() =>
                              api(on ? "/api/enable" : "/api/disable", {
                                method: "POST",
                                body: JSON.stringify({
                                  name: skill.name,
                                  agents: [a.id],
                                  allAgents: false,
                                  allRepos: false,
                                }),
                              }),
                            );
                          }}
                        />
                        {a.label}
                      </label>
                    ))}
                  </div>

                  {snap.repos.length > 0 && (
                    <>
                      <div className="section-label">Repos</div>
                      <div className="switch-grid">
                        {snap.repos.map((r) => (
                          <label key={r.id} className="switch">
                            <input
                              type="checkbox"
                              checked={Boolean(skill.repos[r.id])}
                              disabled={busy || !skill.inStore}
                              onChange={(e) => {
                                const on = e.target.checked;
                                void run(() =>
                                  on
                                    ? api("/api/enable", {
                                        method: "POST",
                                        body: JSON.stringify({
                                          name: skill.name,
                                          repos: [r.id],
                                          allAgents: true,
                                        }),
                                      })
                                    : api("/api/disable", {
                                        method: "POST",
                                        body: JSON.stringify({
                                          name: skill.name,
                                          repos: [r.id],
                                          agents: [],
                                          allAgents: false,
                                        }),
                                      }),
                                );
                              }}
                            />
                            {r.name}
                          </label>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="actions">
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy || !skill.inStore}
                      onClick={() =>
                        void run(() =>
                          api("/api/enable", {
                            method: "POST",
                            body: JSON.stringify({ name: skill.name, allAgents: true }),
                          }),
                        )
                      }
                    >
                      Enable all agents
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api("/api/disable", {
                            method: "POST",
                            body: JSON.stringify({
                              name: skill.name,
                              allAgents: true,
                              allRepos: true,
                            }),
                          }),
                        )
                      }
                    >
                      Disable all
                    </button>
                    <button
                      type="button"
                      className="btn danger"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          api("/api/uninstall", {
                            method: "POST",
                            body: JSON.stringify({ name: skill.name }),
                          }),
                        )
                      }
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReposView({
  snap,
  selectedRepo,
  setSelectedRepo,
  repoPath,
  setRepoPath,
  busy,
  run,
}: {
  snap: Snapshot;
  selectedRepo: string | null;
  setSelectedRepo: (id: string | null) => void;
  repoPath: string;
  setRepoPath: (s: string) => void;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const repo = snap.repos.find((r) => r.id === selectedRepo) ?? null;

  return (
    <section>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="/absolute/path/to/repo"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
        />
        <button
          className="btn primary"
          type="button"
          disabled={busy || !repoPath.trim()}
          onClick={() =>
            void run(async () => {
              const r = await api<Repo>("/api/repos", {
                method: "POST",
                body: JSON.stringify({ path: repoPath.trim() }),
              });
              setSelectedRepo(r.id);
              setRepoPath("");
            })
          }
        >
          Add repo
        </button>
      </div>

      <div className="split">
        <aside className="side-list">
          {snap.repos.length === 0 && (
            <div className="empty">
              <strong>No repos</strong>
              Add a project path to manage per-repo skills.
            </div>
          )}
          {snap.repos.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === selectedRepo ? "side-item active" : "side-item"}
              onClick={() => setSelectedRepo(r.id)}
            >
              <strong>{r.name}</strong>
              <span className="faint mono">{r.path}</span>
            </button>
          ))}
        </aside>

        <div className="repo-panel">
          {!repo && (
            <div className="empty">
              <strong>Select a repo</strong>
              Glance at project skill links vs global enables.
            </div>
          )}
          {repo && (
            <>
              <div className="repo-head">
                <div className="titles">
                  <div className="page-title" style={{ fontSize: 18 }}>
                    {repo.name}
                  </div>
                  <div className="faint mono">{repo.path}</div>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/api/repos/${repo.id}/align`, { method: "POST" }))
                  }
                >
                  Align to global
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/api/repos/${repo.id}/clean`, { method: "POST" }))
                  }
                >
                  Clean links
                </button>
              </div>

              {snap.skills.map((s) => {
                const on = Boolean(s.repos[repo.id]);
                const global = snap.agents.filter((a) => s.agents[a.id]).map((a) => a.id);
                return (
                  <div key={s.name} className="repo-skill">
                    <span className={on ? "dot on" : "dot"} />
                    <span>
                      <strong>{s.name}</strong>
                    </span>
                    <span className="muted">
                      global: {global.length ? global.join(", ") : "—"}
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={busy || !s.inStore}
                      onClick={() =>
                        void run(() =>
                          on
                            ? api("/api/disable", {
                                method: "POST",
                                body: JSON.stringify({
                                  name: s.name,
                                  repos: [repo.id],
                                  agents: [],
                                }),
                              })
                            : api("/api/enable", {
                                method: "POST",
                                body: JSON.stringify({
                                  name: s.name,
                                  repos: [repo.id],
                                  allAgents: true,
                                }),
                              }),
                        )
                      }
                    >
                      {on ? "Disable" : "Enable"}
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function DiscoverView({
  snap,
  query,
  setQuery,
  busy,
  run,
}: {
  snap: Snapshot;
  query: string;
  setQuery: (q: string) => void;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sources = new Map(snap.catalog.sources.map((s) => [s.id, s]));
    return snap.catalog.skills
      .map((s) => ({ ...s, source: sources.get(s.sourceId) }))
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.source?.name.toLowerCase().includes(q) ?? false)
        );
      });
  }, [snap.catalog, query]);

  return (
    <section>
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search verified skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="hint-line">
        Curated allowlist only. Paste any git URL under Skills to install unverified sources.
      </p>
      <div className="list">
        {filtered.map((s) => (
          <div key={`${s.sourceId}-${s.name}`} className="discover-row">
            <div>
              <div className="name-line">
                <strong>{s.name}</strong>
                <span className="pill verified">verified</span>
              </div>
              <div className="muted">{s.description}</div>
              <div className="faint mono">{s.source?.repo}</div>
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={busy || !s.source}
              onClick={() =>
                void run(() =>
                  api("/api/install", {
                    method: "POST",
                    body: JSON.stringify({
                      source: s.source!.repo,
                      subpath: s.path,
                      force: true,
                    }),
                  }),
                )
              }
            >
              Install
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty">
            <strong>No matches</strong>
            Try another search in the verified catalog.
          </div>
        )}
      </div>
    </section>
  );
}
