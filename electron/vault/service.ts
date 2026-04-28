import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
const pathPosix = path.posix;
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

  private normalizeSpaceRelPath(rel: string): string {
    const raw = rel.replaceAll("\\", "/").trim();
    if (!raw || raw === ".") {
      throw new Error("Invalid path");
    }
    const norm = pathPosix.normalize(raw);
    if (norm === ".." || norm.startsWith("../") || norm.includes("/../") || pathPosix.isAbsolute(norm)) {
      throw new Error("Invalid path");
    }
    return norm.replace(/\/+$/g, "");
  }

  private isInsideSpaceRoot(spaceRoot: string, absolutePath: string): boolean {
    const root = path.resolve(spaceRoot);
    const abs = path.resolve(absolutePath);
    return abs === root || abs.startsWith(root + path.sep);
  }

  async createFile(slug: string, relPath: string) {
    const rel = this.normalizeSpaceRelPath(relPath);
    const fullPath = path.join(this.getSpacePath(slug), rel);
    if (!this.isInsideSpaceRoot(this.getSpacePath(slug), fullPath)) {
      throw new Error("Path escapes space root");
    }
    if (fsSync.existsSync(fullPath)) {
      throw new Error("A file or folder with that name already exists");
    }
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, "", "utf8");
  }

  async mkdirInSpace(slug: string, relPath: string) {
    const rel = this.normalizeSpaceRelPath(relPath);
    const fullPath = path.join(this.getSpacePath(slug), rel);
    if (!this.isInsideSpaceRoot(this.getSpacePath(slug), fullPath)) {
      throw new Error("Path escapes space root");
    }
    if (fsSync.existsSync(fullPath)) {
      if (fsSync.statSync(fullPath).isDirectory()) return;
      throw new Error("A file already exists with that name");
    }
    await fs.mkdir(fullPath, { recursive: true });
  }

  async movePath(slug: string, fromRel: string, toRel: string) {
    const from = this.normalizeSpaceRelPath(fromRel);
    const to = this.normalizeSpaceRelPath(toRel);
    const spaceRoot = this.getSpacePath(slug);
    const fromAbs = path.join(spaceRoot, from);
    const toAbs = path.join(spaceRoot, to);
    if (!this.isInsideSpaceRoot(spaceRoot, fromAbs) || !this.isInsideSpaceRoot(spaceRoot, toAbs)) {
      throw new Error("Path escapes space root");
    }
    if (from === to) return;
    if (!fsSync.existsSync(fromAbs)) {
      throw new Error("Source not found");
    }
    if (fsSync.existsSync(toAbs)) {
      throw new Error("A file or folder already exists at the destination");
    }
    const fromStat = await fs.stat(fromAbs);
    const toParent = path.dirname(toAbs);
    if (!fsSync.existsSync(toParent)) {
      await fs.mkdir(toParent, { recursive: true });
    }
    if (fromStat.isFile()) {
      if (fsSync.existsSync(toParent) && !fsSync.statSync(toParent).isDirectory()) {
        throw new Error("Destination parent is not a directory");
      }
    }
    const fromNorm = path.resolve(fromAbs) + (fromStat.isDirectory() ? path.sep : "");
    const toNorm = path.resolve(toAbs) + (fromStat.isDirectory() ? path.sep : "");
    if (fromStat.isDirectory() && toNorm.startsWith(fromNorm)) {
      throw new Error("Cannot move a folder into itself");
    }
    await fs.rename(fromAbs, toAbs);
  }

  async removePath(slug: string, relPath: string) {
    const rel = this.normalizeSpaceRelPath(relPath);
    const fullPath = path.join(this.getSpacePath(slug), rel);
    if (!this.isInsideSpaceRoot(this.getSpacePath(slug), fullPath)) {
      throw new Error("Path escapes space root");
    }
    if (!fsSync.existsSync(fullPath)) {
      return;
    }
    const st = await fs.stat(fullPath);
    if (st.isDirectory()) {
      await fs.rm(fullPath, { recursive: true, force: true });
    } else {
      await fs.unlink(fullPath);
    }
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
