import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import {
  AGENTS,
  OpenSkillManager,
  type AgentId,
} from "@osm/core";

export async function startUiServer(opts: { port: number; openBrowser: boolean }) {
  const mgr = new OpenSkillManager();
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/snapshot", (_req, res) => {
    res.json(mgr.snapshot());
  });

  app.post("/api/scan/import", (_req, res) => {
    res.json(mgr.importOrphans());
  });

  app.post("/api/install", (req, res) => {
    try {
      const { source, subpath, force } = req.body as {
        source: string;
        subpath?: string;
        force?: boolean;
      };
      const result = mgr.install(source, {
        subpath,
        forceUnverified: Boolean(force),
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/enable", (req, res) => {
    try {
      const { name, agents, repos, allAgents } = req.body as {
        name: string;
        agents?: AgentId[];
        repos?: string[];
        allAgents?: boolean;
      };
      const en = mgr.enable(name, { agents, repos, allAgents });
      res.json(en);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/disable", (req, res) => {
    try {
      const { name, agents, repos, allAgents, allRepos } = req.body as {
        name: string;
        agents?: AgentId[];
        repos?: string[];
        allAgents?: boolean;
        allRepos?: boolean;
      };
      const en = mgr.disable(name, { agents, repos, allAgents, allRepos });
      res.json(en);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/uninstall", (req, res) => {
    try {
      const { name } = req.body as { name: string };
      mgr.uninstall(name);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/repos", (req, res) => {
    try {
      const { path: repoPath, name } = req.body as { path: string; name?: string };
      res.json(mgr.addRepo(repoPath, name));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete("/api/repos/:id", (req, res) => {
    res.json({ ok: mgr.removeRepo(req.params.id) });
  });

  app.post("/api/repos/:id/align", (req, res) => {
    try {
      res.json(mgr.alignRepo(req.params.id));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/api/repos/:id/clean", (req, res) => {
    try {
      res.json({ removed: mgr.cleanRepo(req.params.id) });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/discover", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q : "";
    res.json(mgr.discover(q));
  });

  app.get("/api/doctor", (_req, res) => {
    res.json(mgr.doctor());
  });

  const uiDist = resolveUiDist();
  if (uiDist) {
    app.use(express.static(uiDist));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(uiDist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(fallbackHtml());
    });
  }

  await new Promise<void>((resolve, reject) => {
    const server = app.listen(opts.port, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const url = `http://127.0.0.1:${opts.port}`;
  console.log(`Open Skill Manager UI → ${url}`);
  console.log("Press Ctrl+C to stop.");
  if (opts.openBrowser) openUrl(url);

  // keep alive
  await new Promise(() => undefined);
}

function resolveUiDist(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../ui/dist"),
    path.resolve(here, "../../../ui/dist"),
    path.resolve(process.cwd(), "packages/ui/dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}

function openUrl(url: string) {
  const platform = process.platform;
  if (platform === "darwin") execFile("open", [url]);
  else if (platform === "win32") execFile("cmd", ["/c", "start", url]);
  else execFile("xdg-open", [url]);
}

function fallbackHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Open Skill Manager</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 14px/1.45 ui-sans-serif, system-ui; background: #12141a; color: #e8eaef; }
    main { max-width: 960px; margin: 0 auto; padding: 32px 20px; }
    h1 { font-weight: 560; letter-spacing: -0.02em; }
    pre { background: #1a1d26; padding: 16px; border-radius: 8px; overflow: auto; }
    a { color: #9db4ff; }
  </style>
</head>
<body>
  <main>
    <h1>Open Skill Manager</h1>
    <p>UI assets not built yet. API is live — try <a href="/api/snapshot">/api/snapshot</a>.</p>
    <p>Build the UI with <code>npm run build -w @osm/ui</code> then restart <code>osm ui</code>.</p>
  </main>
</body>
</html>`;
}

// silence unused in case tree-shaken
void AGENTS;
