import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CatalogSkill, CatalogSource, VerifiedCatalog } from "./types.js";

export function loadVerifiedCatalog(catalogPath?: string): VerifiedCatalog {
  const candidates = [
    catalogPath,
    process.env.OSM_CATALOG,
    path.resolve(process.cwd(), "catalogs/verified.json"),
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../catalogs/verified.json"),
    path.resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../catalogs/verified.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as VerifiedCatalog;
    }
  }
  return { sources: [], skills: [] };
}

export function searchCatalog(
  catalog: VerifiedCatalog,
  query = "",
): Array<CatalogSkill & { source: CatalogSource }> {
  const q = query.trim().toLowerCase();
  const sources = new Map(catalog.sources.map((s) => [s.id, s]));
  return catalog.skills
    .map((skill) => ({
      ...skill,
      source: sources.get(skill.sourceId) ?? {
        id: skill.sourceId,
        name: skill.sourceId,
        repo: "",
        trust: "unverified" as const,
        skillsPath: ".",
        description: "",
      },
    }))
    .filter((s) => {
      if (!q) return true;
      return (
        s.name.includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.source.name.toLowerCase().includes(q)
      );
    });
}
