import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode, SpaceListItem, ThreadBackend, ThreadRecord } from "../types";

function flattenFiles(nodes: FileNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    if (node.type === "file" && node.name.endsWith(".md")) {
      out.push(node.path);
    }
    if (node.children?.length) {
      out.push(...flattenFiles(node.children));
    }
  }
  return out;
}

function flattenAllFilePaths(nodes: FileNode[]): string[] {
  const out: string[] = [];
  const walk = (n: FileNode) => {
    if (n.type === "file") out.push(n.path);
    n.children?.forEach(walk);
  };
  for (const node of nodes) walk(node);
  return out;
}

function normalizePathForCompare(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

function sameOrNestedPath(absOrRelPath: string, relPath: string): boolean {
  const changed = normalizePathForCompare(absOrRelPath);
  const active = normalizePathForCompare(relPath);
  return changed === active || changed.endsWith(`/${active}`);
}

function remapPathForMove(relPath: string, fileMove?: { from: string; to: string }): string {
  if (!fileMove) return relPath;
  if (relPath === fileMove.from) return fileMove.to;
  if (relPath.startsWith(`${fileMove.from}/`)) {
    return `${fileMove.to}${relPath.slice(fileMove.from.length)}`;
  }
  return relPath;
}

export function useWorkspaceState() {
  const [vaultPath, setVaultPath] = useState<string>();
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [activeSpace, setActiveSpace] = useState<SpaceListItem | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [openFiles, setOpenFiles] = useState<string[]>([]);
  const [activeFile, setActiveFileState] = useState<string>("");
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>();
  const activeSpaceRef = useRef<SpaceListItem | null>(null);
  const activeFileRef = useRef("");
  const openFilesRef = useRef<string[]>([]);
  const refreshFileTreeRef = useRef<(fileMove?: { from: string; to: string }) => Promise<void>>(async () => {});
  const fileTreeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  activeSpaceRef.current = activeSpace;
  activeFileRef.current = activeFile;
  openFilesRef.current = openFiles;
  const activeContent = useMemo(() => (activeFile ? (fileContents[activeFile] ?? "") : ""), [activeFile, fileContents]);

  const activeThread = useMemo(
    () => threads.find((item) => item.threadId === activeThreadId),
    [threads, activeThreadId]
  );

  const refreshSpaces = useCallback(async () => {
    try {
      const next = await window.basis.spaces.list();
      setSpaces(next);
    } catch {
      setSpaces([]);
    }
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!activeSpace) {
      setThreads([]);
      setActiveThreadId(undefined);
      return;
    }
    const next = await window.basis.threads.list(activeSpace.slug);
    setThreads(next);
    if (!next.some((item) => item.threadId === activeThreadId)) {
      setActiveThreadId(next[0]?.threadId);
    }
  }, [activeSpace, activeThreadId]);

  useEffect(() => {
    window.basis.config.get().then(async ({ vaultPath: storedPath }) => {
      setVaultPath(storedPath);
      if (storedPath) await refreshSpaces();
    });
  }, [refreshSpaces]);

  useEffect(() => {
    if (!activeSpace) return;
    let cancelled = false;
    void (async () => {
      const [tree, prefs, nextThreads] = await Promise.all([
        window.basis.files.tree(activeSpace.slug),
        window.basis.prefs.getSpaceWorkspace(activeSpace.slug),
        window.basis.threads.list(activeSpace.slug)
      ]);
      if (cancelled) return;
      setFileTree(tree);
      const all = flattenAllFilePaths(tree);
      const mds = flattenFiles(tree);
      const preferred = prefs?.activeRelPath ?? prefs?.lastActiveRelPath;
      const firstMd = mds.includes("overview.md") ? "overview.md" : mds[0];
      const firstAny = all[0];
      const fallback = preferred && all.includes(preferred) ? preferred : firstMd ?? firstAny ?? "";
      const persistedOpen = (prefs?.openRelPaths ?? []).filter((p) => all.includes(p));
      const nextOpen = persistedOpen.length > 0 ? persistedOpen : fallback ? [fallback] : [];
      const nextActive = nextOpen.includes(preferred ?? "") ? (preferred as string) : nextOpen[0] ?? "";
      setOpenFiles(nextOpen);
      setActiveFileState(nextActive);
      if (nextOpen.length > 0) {
        const entries = await Promise.all(
          nextOpen.map(async (relPath) => {
            try {
              const content = await window.basis.files.read(activeSpace.slug, relPath);
              return [relPath, content] as const;
            } catch {
              return [relPath, ""] as const;
            }
          })
        );
        if (!cancelled) {
          setFileContents(Object.fromEntries(entries));
        }
      } else {
        setFileContents({});
      }
      setThreads(nextThreads);
      setActiveThreadId(nextThreads[0]?.threadId);
    })().catch(() => {
      if (cancelled) return;
      setFileTree([]);
      setOpenFiles([]);
      setActiveFileState("");
      setFileContents({});
      setThreads([]);
      setActiveThreadId(undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSpace]);

  useEffect(() => {
    const offFile = window.basis.events.onVaultFileChanged((payload) => {
      const changed = payload as { spaceSlug: string; absolutePath: string };
      const space = activeSpaceRef.current;
      if (!space || changed.spaceSlug !== space.slug) return;
      const matches = openFilesRef.current.filter((p) => sameOrNestedPath(changed.absolutePath, p));
      if (matches.length > 0) {
        void Promise.all(
          matches.map(async (relPath) => {
            try {
              const content = await window.basis.files.read(space.slug, relPath);
              return [relPath, content] as const;
            } catch {
              return [relPath, ""] as const;
            }
          })
        ).then((entries) => {
          setFileContents((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
        });
      }
      clearTimeout(fileTreeRefreshTimerRef.current);
      fileTreeRefreshTimerRef.current = setTimeout(() => {
        void refreshFileTreeRef.current();
      }, 120);
    });
    return () => {
      offFile();
      clearTimeout(fileTreeRefreshTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!activeSpace) return;
    void window.basis.prefs.setSpaceWorkspace(activeSpace.slug, {
      lastActiveRelPath: activeFile || undefined,
      activeRelPath: activeFile || undefined,
      openRelPaths: openFiles
    });
  }, [activeFile, activeSpace, openFiles]);

  const pickVault = useCallback(async () => {
    const picked = await window.basis.vault.pick();
    if (!picked) return;
    setVaultPath(picked);
    await refreshSpaces();
  }, [refreshSpaces]);

  const createSpace = useCallback(
    async (title?: string) => {
      if (!vaultPath) return;
      await window.basis.spaces.create(title || undefined);
      await refreshSpaces();
    },
    [vaultPath, refreshSpaces]
  );

  const renameSpace = useCallback(
    async (slug: string, newTitle: string) => {
      await window.basis.spaces.rename(slug, newTitle);
      await refreshSpaces();
    },
    [refreshSpaces]
  );

  const deleteSpace = useCallback(
    async (slug: string) => {
      await window.basis.spaces.delete(slug);
      await refreshSpaces();
    },
    [refreshSpaces]
  );

  const openSpace = useCallback(
    async (space: SpaceListItem) => {
      await window.basis.spaces.setLastAccessed(space.slug);
      await refreshSpaces();
      setActiveSpace(space);
    },
    [refreshSpaces]
  );

  const openFile = useCallback(
    async (relPath: string) => {
      if (!activeSpace || !relPath) return;
      setOpenFiles((prev) => (prev.includes(relPath) ? prev : [...prev, relPath]));
      setActiveFileState(relPath);
      if (fileContents[relPath] != null) return;
      try {
        const content = await window.basis.files.read(activeSpace.slug, relPath);
        setFileContents((prev) => ({ ...prev, [relPath]: content }));
      } catch {
        setFileContents((prev) => ({ ...prev, [relPath]: "" }));
      }
    },
    [activeSpace, fileContents]
  );

  const closeFile = useCallback((relPath: string) => {
    const currentOpen = openFilesRef.current;
    const nextOpen = currentOpen.filter((p) => p !== relPath);
    setOpenFiles(nextOpen);
    setFileContents((prev) => {
      const next = { ...prev };
      delete next[relPath];
      return next;
    });
    if (activeFileRef.current !== relPath) return;
    if (nextOpen.length === 0) {
      setActiveFileState("");
      return;
    }
    const closingIdx = currentOpen.indexOf(relPath);
    const fallbackIdx = Math.max(0, closingIdx - 1);
    setActiveFileState(nextOpen[fallbackIdx] ?? nextOpen[0] ?? "");
  }, []);

  const saveActiveFile = useCallback(
    async (nextContent: string) => {
      if (!activeSpace || !activeFile) return;
      setFileContents((prev) => ({ ...prev, [activeFile]: nextContent }));
      await window.basis.files.write(activeSpace.slug, activeFile, nextContent);
    },
    [activeFile, activeSpace]
  );

  const createThread = useCallback(async (opts?: { title?: string; backend?: ThreadBackend }) => {
    if (!activeSpace) return;
    const rec = await window.basis.threads.create(activeSpace.slug, opts);
    const next = await window.basis.threads.list(activeSpace.slug);
    setThreads(next);
    setActiveThreadId(rec.threadId);
  }, [activeSpace]);

  const refreshFileTree = useCallback(
    async (fileMove?: { from: string; to: string }) => {
      if (!activeSpace) return;
      const tree = await window.basis.files.tree(activeSpace.slug);
      setFileTree(tree);
      const all = flattenAllFilePaths(tree);
      const allSet = new Set(all);
      const mds = flattenFiles(tree);
      const defaultFile = (mds.includes("overview.md") ? "overview.md" : mds[0]) ?? all[0] ?? "";
      setOpenFiles((prev) => {
        const remapped = prev.map((p) => remapPathForMove(p, fileMove)).filter((p) => allSet.has(p));
        if (remapped.length > 0) return remapped;
        return defaultFile ? [defaultFile] : [];
      });
      setFileContents((prev) => {
        const next: Record<string, string> = {};
        for (const [key, value] of Object.entries(prev)) {
          const remapped = remapPathForMove(key, fileMove);
          if (allSet.has(remapped)) next[remapped] = value;
        }
        return next;
      });
      setActiveFileState((prev) => {
        let p = prev;
        p = remapPathForMove(p, fileMove);
        if (p && allSet.has(p)) return p;
        const fallbackOpen = openFilesRef.current.map((it) => remapPathForMove(it, fileMove)).find((it) => allSet.has(it));
        return fallbackOpen ?? defaultFile;
      });
    },
    [activeSpace]
  );
  refreshFileTreeRef.current = refreshFileTree;

  const fileTreeActions = useMemo(() => {
    if (!activeSpace) return null;
    const slug = activeSpace.slug;
    return {
      createFile: async (relPath: string) => {
        await window.basis.files.createFile(slug, relPath);
        await refreshFileTree();
        await openFile(relPath);
      },
      mkdir: async (relPath: string) => {
        await window.basis.files.mkdir(slug, relPath);
        await refreshFileTree();
      },
      move: async (from: string, to: string) => {
        await window.basis.files.move(slug, from, to);
        await refreshFileTree({ from, to });
      },
      remove: async (relPath: string) => {
        await window.basis.files.remove(slug, relPath);
        await refreshFileTree();
      }
    };
  }, [activeSpace, openFile, refreshFileTree]);

  return {
    vaultPath,
    spaces,
    activeSpace,
    fileTree,
    openFiles,
    activeFile,
    activeContent,
    threads,
    activeThreadId,
    activeThread,
    setActiveSpace,
    setActiveFile: openFile,
    closeFile,
    setActiveThreadId,
    refreshSpaces,
    refreshThreads,
    pickVault,
    createSpace,
    openSpace,
    renameSpace,
    deleteSpace,
    saveActiveFile,
    createThread,
    refreshFileTree,
    fileTreeActions
  };
}
