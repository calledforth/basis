import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import chokidar, { type FSWatcher } from "chokidar";
import { getSpacesMeta, getVaultPath, setSpaceLastAccessed } from "../core/store.js";
import { nowIso } from "../core/types.js";

export type FileNode = {
  path: string;
  name: string;
  type: "file" | "directory";
  children?: FileNode[];
};

type VaultServiceDeps = {
  addLog: (entry: { scope: "vault"; level: "info" | "warn" | "error"; message: string; data?: unknown }) => void;
  onFileChanged: (payload: { spaceSlug: string; absolutePath: string }) => void;
};

function parseOverviewTitleAndDates(content: string, fallback: string) {
  const parsed = matter(content);
  return {
    title: (parsed.data.title as string | undefined) ?? fallback,
    created: parsed.data.created as string | undefined,
    updated: parsed.data.updated as string | undefined
  };
}

export class VaultService {
  private activeWatcher: FSWatcher | null = null;
  private lastSpaceSlug: string | null = null;
  private readonly deps: VaultServiceDeps;

  constructor(deps: VaultServiceDeps) {
    this.deps = deps;
  }

  private getVaultPathOrThrow(): string {
    const vaultPath = getVaultPath();
    if (!vaultPath) {
      throw new Error("Vault not configured");
    }
    return vaultPath;
  }

  getSpacePath(slug: string): string {
    return path.join(this.getVaultPathOrThrow(), slug);
  }

  private overviewPath(slug: string): string {
    return path.join(this.getSpacePath(slug), "overview.md");
  }

  private async ensureOverviewForSpace(slug: string, title: string) {
    const file = this.overviewPath(slug);
    if (fsSync.existsSync(file)) return;

    const content = matter.stringify("Write your research summary here.\n", {
      title,
      created: nowIso(),
      updated: nowIso()
    });
    await fs.writeFile(file, content, "utf8");
  }

  async listSpaces() {
    const vaultPath = this.getVaultPathOrThrow();
    const entries = await fs.readdir(vaultPath, { withFileTypes: true });
    const spacesMeta = getSpacesMeta();

    const spaces = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const slug = entry.name;
          const ovPath = this.overviewPath(slug);
          let title = slug;
          let created: string | undefined;
          let updated: string | undefined;
          if (fsSync.existsSync(ovPath)) {
            const content = await fs.readFile(ovPath, "utf8");
            const parsed = parseOverviewTitleAndDates(content, slug);
            title = parsed.title;
            created = parsed.created;
            updated = parsed.updated;
          }
          return {
            slug,
            title,
            overviewPath: ovPath,
            created,
            updated,
            lastAccessedAt: spacesMeta[slug]?.lastAccessedAt
          };
        })
    );

    spaces.sort((a, b) => {
      const aAccess = a.lastAccessedAt ? Date.parse(a.lastAccessedAt) : 0;
      const bAccess = b.lastAccessedAt ? Date.parse(b.lastAccessedAt) : 0;
      return bAccess - aAccess;
    });
    return spaces;
  }

  async createSpace(title?: string) {
    const vaultPath = this.getVaultPathOrThrow();
    const entries = await fs.readdir(vaultPath, { withFileTypes: true });
    const existing = new Set(entries.filter((d) => d.isDirectory()).map((d) => d.name));

    let i = 1;
    let slug = `untitled-${i}`;
    while (existing.has(slug)) {
      i += 1;
      slug = `untitled-${i}`;
    }

    await fs.mkdir(path.join(vaultPath, slug), { recursive: true });
    await this.ensureOverviewForSpace(slug, title ?? `Untitled ${i}`);
    setSpaceLastAccessed(slug, nowIso());
    return { slug, overviewPath: this.overviewPath(slug) };
  }

  async listFilesRecursively(basePath: string, rel = ""): Promise<FileNode[]> {
    const target = path.join(basePath, rel);
    const entries = await fs.readdir(target, { withFileTypes: true });
    const nodes = await Promise.all(
      entries
        .filter((entry) => !entry.name.startsWith("."))
        .map(async (entry) => {
          const entryRel = path.join(rel, entry.name).replaceAll("\\", "/");
          if (entry.isDirectory()) {
            return {
              path: entryRel,
              name: entry.name,
              type: "directory" as const,
              children: await this.listFilesRecursively(basePath, entryRel)
            };
          }
          return {
            path: entryRel,
            name: entry.name,
            type: "file" as const
          };
        })
    );
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }

  setupWatcherForSpace(slug: string) {
    if (this.lastSpaceSlug === slug && this.activeWatcher) return;

    this.activeWatcher?.close();
    const root = this.getSpacePath(slug);
    this.activeWatcher = chokidar.watch(root, {
      ignoreInitial: true
    });
    this.lastSpaceSlug = slug;

    const publish = (changedPath: string) => {
      this.deps.addLog({
        scope: "vault",
        level: "info",
        message: "Detected external file change",
        data: { spaceSlug: slug, changedPath }
      });
      this.deps.onFileChanged({
        spaceSlug: slug,
        absolutePath: changedPath
      });
    };

    this.activeWatcher.on("change", publish);
    this.activeWatcher.on("add", publish);
    this.activeWatcher.on("unlink", publish);
  }

  async readFile(spaceSlug: string, relPath: string) {
    const fullPath = path.join(this.getSpacePath(spaceSlug), relPath);
    return fs.readFile(fullPath, "utf8");
  }

  async writeFile(spaceSlug: string, relPath: string, content: string) {
    const fullPath = path.join(this.getSpacePath(spaceSlug), relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }

  setLastAccessed(slug: string) {
    setSpaceLastAccessed(slug, nowIso());
  }

  async renameSpace(slug: string, newTitle: string) {
    const ovPath = this.overviewPath(slug);
    if (!fsSync.existsSync(ovPath)) {
      throw new Error(`Space not found: ${slug}`);
    }
    const content = await fs.readFile(ovPath, "utf8");
    const parsed = matter(content);
    const updatedMatter = {
      ...parsed.data,
      title: newTitle,
      updated: nowIso()
    };
    const newContent = matter.stringify(parsed.content, updatedMatter);
    await fs.writeFile(ovPath, newContent, "utf8");
  }

  async deleteSpace(slug: string) {
    const spacePath = this.getSpacePath(slug);
    if (fsSync.existsSync(spacePath)) {
      await fs.rm(spacePath, { recursive: true, force: true });
    }
  }

  dispose() {
    this.activeWatcher?.close();
    this.activeWatcher = null;
    this.lastSpaceSlug = null;
  }
}
