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

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data as T;
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

  return (
    <div className="shell">
      <header className="top">
        <div>
          <div className="brand">Open Skill Manager</div>
          <p className="tag">Skills across Claude, Codex, OpenCode, Pi, and Cursor</p>
        </div>
        <nav className="tabs">
          {(["skills", "repos", "discover"] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
              type="button"
            >
              {t}
            </button>
          ))}
        </nav>
        <button className="ghost" type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </header>

      {error && <div className="banner">{error}</div>}

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
    <section className="panel">
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Install from local path or git URL…"
          value={installSource}
          onChange={(e) => setInstallSource(e.target.value)}
        />
        <button
          className="primary"
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
          className="ghost"
          type="button"
          disabled={busy}
          onClick={() => void run(() => api("/api/scan/import", { method: "POST" }))}
        >
          Import orphans
        </button>
      </div>

      <div className="table">
        <div className="thead">
          <span>Skill</span>
          <span>Ver</span>
          <span>Trust</span>
          {agents.map((a) => (
            <span key={a.id} title={a.label} className="agent-h">
              {a.id.slice(0, 3)}
            </span>
          ))}
          <span>Repos</span>
        </div>
        {snap.skills.length === 0 && (
          <div className="empty">No skills yet. Install one or import orphans from disk.</div>
        )}
        {snap.skills.map((skill) => {
          const open = expanded === skill.name;
          const repoCount = Object.values(skill.repos).filter(Boolean).length;
          return (
            <div key={skill.name} className={open ? "trow open" : "trow"}>
              <button
                type="button"
                className="tmain"
                onClick={() => setExpanded(open ? null : skill.name)}
              >
                <span className="name">{skill.name}</span>
                <span className="mono muted">{skill.version ?? "—"}</span>
                <span className={`trust ${skill.trust}`}>{skill.trust}</span>
                {agents.map((a) => (
                  <span key={a.id} className={skill.agents[a.id] ? "dot on" : "dot"} />
                ))}
                <span className="muted">{repoCount || "—"}</span>
              </button>
              {open && (
                <div className="detail">
                  <p>{skill.description || "No description"}</p>
                  <div className="toggles">
                    {agents.map((a) => (
                      <label key={a.id} className="toggle">
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
                    <div className="toggles">
                      {snap.repos.map((r) => (
                        <label key={r.id} className="toggle">
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
                          repo:{r.id}
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="ghost"
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
                      className="ghost"
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
                      className="danger"
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
    <section className="panel">
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="/absolute/path/to/repo"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
        />
        <button
          className="primary"
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
        <aside className="side">
          {snap.repos.length === 0 && <div className="empty">No repos registered.</div>}
          {snap.repos.map((r) => (
            <button
              key={r.id}
              type="button"
              className={r.id === selectedRepo ? "side-item active" : "side-item"}
              onClick={() => setSelectedRepo(r.id)}
            >
              <strong>{r.name}</strong>
              <span className="muted mono">{r.path}</span>
            </button>
          ))}
        </aside>
        <div className="main">
          {!repo && <div className="empty">Select a repo</div>}
          {repo && (
            <>
              <div className="toolbar">
                <div>
                  <div className="brand-sm">{repo.name}</div>
                  <div className="muted mono">{repo.path}</div>
                </div>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/api/repos/${repo.id}/align`, { method: "POST" }))
                  }
                >
                  Align to global
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => api(`/api/repos/${repo.id}/clean`, { method: "POST" }))
                  }
                >
                  Clean links
                </button>
              </div>
              <div className="table compact">
                {snap.skills.map((s) => {
                  const on = Boolean(s.repos[repo.id]);
                  const global = snap.agents.filter((a) => s.agents[a.id]).map((a) => a.id);
                  return (
                    <div key={s.name} className="trow flat">
                      <span className={on ? "dot on" : "dot"} />
                      <span className="name">{s.name}</span>
                      <span className="muted">
                        global: {global.length ? global.join(", ") : "—"}
                      </span>
                      <button
                        type="button"
                        className="ghost"
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
              </div>
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
    <section className="panel">
      <div className="toolbar">
        <input
          className="input grow"
          placeholder="Search verified skills…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <p className="muted pad">
        Showing verified sources only. Paste any git URL on the Skills tab to install unverified
        skills.
      </p>
      <div className="table">
        {filtered.map((s) => (
          <div key={`${s.sourceId}-${s.name}`} className="trow flat discover">
            <div>
              <div className="name">
                {s.name} <span className="trust verified">verified</span>
              </div>
              <div className="muted">{s.description}</div>
              <div className="muted mono">{s.source?.repo}</div>
            </div>
            <button
              type="button"
              className="primary"
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
        {filtered.length === 0 && <div className="empty">No verified skills match.</div>}
      </div>
    </section>
  );
}
