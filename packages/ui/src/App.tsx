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

interface SkillDetail extends SkillStatus {
  storePath: string | null;
  versions: string[];
  currentVersion: string | null;
  license?: string;
  compatibility?: string;
  allowedTools?: string;
  body: string;
  bodyPreview: string;
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
type View =
  | { kind: "tab"; tab: Tab }
  | { kind: "skill"; name: string };

const TAB_META: Record<Tab, { title: string; blurb: string }> = {
  skills: { title: "Skills", blurb: "Installed · synced across agents" },
  repos: { title: "Repos", blurb: "Project-scoped skill links" },
  discover: { title: "Discover", blurb: "Verified catalog · safe installs" },
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

function IconSkills() {
  return (
    <svg className="nav-icon" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 3.5h10v2H3v-2Zm0 3.5h7v2H3V7Zm0 3.5h10v2H3v-2Z" fill="currentColor" />
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

function skillInitials(name: string) {
  const parts = name.split("-").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function App() {
  const [view, setView] = useState<View>({ kind: "tab", tab: "skills" });
  const [returnTab, setReturnTab] = useState<Tab>("skills");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [installSource, setInstallSource] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [discoverQ, setDiscoverQ] = useState("");
  const [discoverSource, setDiscoverSource] = useState<string>("all");

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

  const loadDetail = useCallback(async (name: string) => {
    const d = await api<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`);
    setDetail(d);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (view.kind === "skill") {
      void loadDetail(view.name).catch((err) =>
        setError(err instanceof Error ? err.message : String(err)),
      );
    } else {
      setDetail(null);
    }
  }, [view, loadDetail]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      if (view.kind === "skill") await loadDetail(view.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const agents = snap?.agents ?? [];
  const tab = view.kind === "tab" ? view.tab : returnTab;
  const meta = view.kind === "tab" ? TAB_META[view.tab] : null;

  const openSkill = (name: string, from: Tab = "skills") => {
    setReturnTab(from);
    setView({ kind: "skill", name });
  };
  const goTab = (t: Tab) => setView({ kind: "tab", tab: t });
  const goBack = () => goTab(returnTab);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">
            <div className="logo-osm" aria-hidden>
              <span className="logo-sheet" />
              <span className="logo-sheet" />
              <span className="logo-sheet" />
            </div>
            <div className="brand">Open Skill Manager</div>
          </div>
          <p className="brand-sub">Local skill control plane</p>
        </div>

        <div className="nav-section">Browse</div>
        <nav className="nav">
          <button
            type="button"
            className={tab === "skills" && view.kind === "tab" ? "nav-item active" : "nav-item"}
            onClick={() => goTab("skills")}
          >
            <IconSkills />
            <span className="nav-label">Skills</span>
            <span className="nav-count">{snap?.skills.length ?? "·"}</span>
          </button>
          <button
            type="button"
            className={tab === "repos" && view.kind === "tab" ? "nav-item active" : "nav-item"}
            onClick={() => goTab("repos")}
          >
            <IconRepos />
            <span className="nav-label">Repos</span>
            <span className="nav-count">{snap?.repos.length ?? "·"}</span>
          </button>
          <button
            type="button"
            className={tab === "discover" && view.kind === "tab" ? "nav-item active" : "nav-item"}
            onClick={() => goTab("discover")}
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
          {view.kind === "skill" ? (
            <>
              <button type="button" className="back-btn" onClick={goBack}>
                ← {TAB_META[returnTab].title}
              </button>
              <div className="page-meta crumb">
                {TAB_META[returnTab].title} / {view.name}
              </div>
            </>
          ) : (
            <>
              <div className="page-title">{meta!.title}</div>
              <div className="page-meta">{meta!.blurb}</div>
            </>
          )}
        </header>

        {error && <div className="banner">{error}</div>}

        <div className="content">
          {!snap && !error && <div className="empty">Loading…</div>}

          {view.kind === "skill" && (
            <SkillDetailView
              detail={detail}
              agents={agents}
              repos={snap?.repos ?? []}
              busy={busy}
              run={run}
              onUninstalled={() => goTab(returnTab)}
            />
          )}

          {view.kind === "tab" && view.tab === "skills" && snap && (
            <SkillsView
              snap={snap}
              agents={agents}
              busy={busy}
              installSource={installSource}
              setInstallSource={setInstallSource}
              run={run}
              onOpen={(name) => openSkill(name, "skills")}
              onDiscover={() => goTab("discover")}
            />
          )}

          {view.kind === "tab" && view.tab === "repos" && snap && (
            <ReposView
              snap={snap}
              selectedRepo={selectedRepo}
              setSelectedRepo={setSelectedRepo}
              repoPath={repoPath}
              setRepoPath={setRepoPath}
              busy={busy}
              run={run}
              onOpen={(name) => openSkill(name, "repos")}
            />
          )}

          {view.kind === "tab" && view.tab === "discover" && snap && (
            <DiscoverView
              snap={snap}
              query={discoverQ}
              setQuery={setDiscoverQ}
              sourceFilter={discoverSource}
              setSourceFilter={setDiscoverSource}
              busy={busy}
              run={run}
              onInstalled={(name) => openSkill(name, "discover")}
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
  busy,
  installSource,
  setInstallSource,
  run,
  onOpen,
  onDiscover,
}: {
  snap: Snapshot;
  agents: Snapshot["agents"];
  busy: boolean;
  installSource: string;
  setInstallSource: (s: string) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onOpen: (name: string) => void;
  onDiscover: () => void;
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
            void run(async () => {
              const result = await api<{ name: string }>("/api/install", {
                method: "POST",
                body: JSON.stringify({ source: installSource.trim() }),
              });
              setInstallSource("");
              onOpen(result.name);
            })
          }
        >
          Install
        </button>
        <button
          className="btn ghost"
          type="button"
          disabled={busy}
          title="Pull skills already on disk into the OSM store"
          onClick={() => void run(() => api("/api/scan/import", { method: "POST" }))}
        >
          Import from disk
        </button>
      </div>

      {snap.skills.length === 0 && (
        <div className="empty">
          <strong>Nothing installed yet</strong>
          <p className="empty-actions">
            <button type="button" className="btn primary" onClick={onDiscover}>
              Browse Discover
            </button>
          </p>
        </div>
      )}

      <div className="skill-grid">
        {snap.skills.map((skill) => {
          const enabled = agents.filter((a) => skill.agents[a.id]).length;
          const repoCount = Object.values(skill.repos).filter(Boolean).length;
          return (
            <button
              key={skill.name}
              type="button"
              className="skill-card"
              onClick={() => onOpen(skill.name)}
            >
              <div className="skill-card-top">
                <div className="skill-avatar">{skillInitials(skill.name)}</div>
                <div className="skill-card-head">
                  <div className="skill-card-title">
                    <strong>{skill.name}</strong>
                    <span className={`pill ${skill.trust}`}>{skill.trust}</span>
                  </div>
                  <div className="mono faint">{skill.version ?? "no version"}</div>
                </div>
              </div>
              <p className="skill-card-desc">
                {skill.description || "No description in SKILL.md"}
              </p>
              <div className="skill-card-meta">
                <div className="faint">
                  {enabled} agent{enabled === 1 ? "" : "s"}
                  {repoCount ? ` · ${repoCount} repo${repoCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SkillDetailView({
  detail,
  agents,
  repos,
  busy,
  run,
  onUninstalled,
}: {
  detail: SkillDetail | null;
  agents: Snapshot["agents"];
  repos: Repo[];
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onUninstalled: () => void;
}) {
  if (!detail) return <div className="empty">Loading skill…</div>;

  const enabledAgents = agents.filter((a) => detail.agents[a.id]);
  const enabledRepos = repos.filter((r) => detail.repos[r.id]);

  return (
    <section className="detail-page">
      <div className="detail-hero">
        <div className="skill-avatar lg">{skillInitials(detail.name)}</div>
        <div className="detail-hero-text">
          <div className="detail-title-row">
            <h1>{detail.name}</h1>
            <span className={`pill ${detail.trust}`}>{detail.trust}</span>
            {detail.hold && <span className="pill">on hold</span>}
          </div>
          <p className="detail-lead">{detail.description || "No description"}</p>
          <div className="detail-facts">
            <div>
              <span className="fact-label">Version</span>
              <span className="mono">{detail.currentVersion ?? detail.version ?? "—"}</span>
            </div>
            <div>
              <span className="fact-label">Agents</span>
              <span>
                {enabledAgents.length}/{agents.length} enabled
              </span>
            </div>
            <div>
              <span className="fact-label">Repos</span>
              <span>{enabledRepos.length} linked</span>
            </div>
            {detail.license && (
              <div>
                <span className="fact-label">License</span>
                <span>{detail.license}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !detail.inStore}
          onClick={() =>
            void run(() =>
              api("/api/enable", {
                method: "POST",
                body: JSON.stringify({ name: detail.name, allAgents: true }),
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
                  name: detail.name,
                  allAgents: true,
                  allRepos: true,
                }),
              }),
            )
          }
        >
          Disable all
        </button>
        {detail.source && (
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              void run(() =>
                api(`/api/skills/${encodeURIComponent(detail.name)}/update`, {
                  method: "POST",
                  body: JSON.stringify({}),
                }),
              )
            }
          >
            Update from source
          </button>
        )}
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api("/api/uninstall", {
                method: "POST",
                body: JSON.stringify({ name: detail.name }),
              });
              onUninstalled();
            })
          }
        >
          Uninstall
        </button>
      </div>

      <div className="detail-grid">
        <div className="detail-panel">
          <div className="section-label">Agents</div>
          <div className="switch-grid">
            {agents.map((a) => (
              <label key={a.id} className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(detail.agents[a.id])}
                  disabled={busy || !detail.inStore}
                  onChange={(e) => {
                    const on = e.target.checked;
                    void run(() =>
                      api(on ? "/api/enable" : "/api/disable", {
                        method: "POST",
                        body: JSON.stringify({
                          name: detail.name,
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
        </div>

        <div className="detail-panel">
          <div className="section-label">Repos</div>
          {repos.length === 0 ? (
            <p className="muted">No repos registered yet.</p>
          ) : (
            <div className="switch-grid">
              {repos.map((r) => (
                <label key={r.id} className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(detail.repos[r.id])}
                    disabled={busy || !detail.inStore}
                    onChange={(e) => {
                      const on = e.target.checked;
                      void run(() =>
                        on
? api("/api/enable", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        name: detail.name,
                                        repos: [r.id],
                                        repoOnly: true,
                                      }),
                                    })
                          : api("/api/disable", {
                              method: "POST",
                              body: JSON.stringify({
                                name: detail.name,
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
          )}
        </div>

        <div className="detail-panel">
          <div className="section-label">Source & store</div>
          <dl className="kv">
            <div>
              <dt>Source</dt>
              <dd className="mono">{detail.source ?? "—"}</dd>
            </div>
            <div>
              <dt>Store path</dt>
              <dd className="mono">{detail.storePath ?? "—"}</dd>
            </div>
            <div>
              <dt>Versions</dt>
              <dd className="mono">
                {detail.versions.length ? detail.versions.join(", ") : "—"}
              </dd>
            </div>
            {detail.compatibility && (
              <div>
                <dt>Compatibility</dt>
                <dd>{detail.compatibility}</dd>
              </div>
            )}
            {detail.allowedTools && (
              <div>
                <dt>Allowed tools</dt>
                <dd className="mono">{detail.allowedTools}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="detail-panel wide">
          <div className="section-label">SKILL.md</div>
          {detail.bodyPreview ? (
            <pre className="skill-md">{detail.bodyPreview}</pre>
          ) : (
            <p className="muted">No body content available.</p>
          )}
        </div>
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
  onOpen,
}: {
  snap: Snapshot;
  selectedRepo: string | null;
  setSelectedRepo: (id: string | null) => void;
  repoPath: string;
  setRepoPath: (s: string) => void;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onOpen: (name: string) => void;
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
                  <div className="page-title">{repo.name}</div>
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
                    <button type="button" className="linkish" onClick={() => onOpen(s.name)}>
                      <strong>{s.name}</strong>
                    </button>
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
                                  repoOnly: true,
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
  sourceFilter,
  setSourceFilter,
  busy,
  run,
  onInstalled,
}: {
  snap: Snapshot;
  query: string;
  setQuery: (q: string) => void;
  sourceFilter: string;
  setSourceFilter: (id: string) => void;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onInstalled: (name: string) => void;
}) {
  const installed = useMemo(
    () => new Set(snap.skills.map((s) => s.name)),
    [snap.skills],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sources = new Map(snap.catalog.sources.map((s) => [s.id, s]));
    return snap.catalog.skills
      .map((s) => ({ ...s, source: sources.get(s.sourceId) }))
      .filter((s) => {
        if (sourceFilter !== "all" && s.sourceId !== sourceFilter) return false;
        if (!q) return true;
        return (
          s.name.includes(q) ||
          s.description.toLowerCase().includes(q) ||
          (s.source?.name.toLowerCase().includes(q) ?? false)
        );
      });
  }, [snap.catalog, query, sourceFilter]);

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

      <div className="source-strip">
        <button
          type="button"
          className={sourceFilter === "all" ? "source-pill active" : "source-pill"}
          onClick={() => setSourceFilter("all")}
        >
          All
        </button>
        {snap.catalog.sources.map((s) => (
          <button
            key={s.id}
            type="button"
            className={sourceFilter === s.id ? "source-pill active" : "source-pill"}
            onClick={() => setSourceFilter(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="skill-grid discover-grid">
        {filtered.map((s) => {
          const already = installed.has(s.name);
          return (
            <div key={`${s.sourceId}-${s.name}`} className="skill-card static">
              <div className="skill-card-top">
                <div className="skill-avatar">{skillInitials(s.name)}</div>
                <div className="skill-card-head">
                  <div className="skill-card-title">
                    <strong>{s.name}</strong>
                    <span className="pill verified">verified</span>
                  </div>
                  <div className="faint">{s.source?.name}</div>
                </div>
              </div>
              <p className="skill-card-desc">{s.description}</p>
              <div className="skill-card-meta">
                <span className="faint mono truncate">{s.source?.repo}</span>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || already || !s.source}
                  onClick={() =>
                    void run(async () => {
                      const result = await api<{ name: string }>("/api/install", {
                        method: "POST",
                        body: JSON.stringify({
                          source: s.source!.repo,
                          subpath: s.path,
                        }),
                      });
                      onInstalled(result.name);
                    })
                  }
                >
                  {already ? "Installed" : "Install"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && (
        <div className="empty">
          <strong>No matches</strong>
          Try another search or source filter.
        </div>
      )}
    </section>
  );
}
