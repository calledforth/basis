import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useWorkspaceState() {
  const [vaultPath, setVaultPath] = useState<string>();
  const [spaces, setSpaces] = useState<SpaceListItem[]>([]);
  const [activeSpace, setActiveSpace] = useState<SpaceListItem | null>(null);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [activeFile, setActiveFile] = useState<string>("overview.md");
  const [activeContent, setActiveContent] = useState<string>("");
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string>();

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

    void window.basis.files.tree(activeSpace.slug).then((tree) => {
      if (cancelled) return;
      setFileTree(tree);
      const files = flattenFiles(tree);
      const first = files.includes("overview.md") ? "overview.md" : files[0];
      if (first) setActiveFile(first);
    });

    void window.basis.threads.list(activeSpace.slug).then(async (next) => {
      if (cancelled) return;
      setThreads(next);
      setActiveThreadId(next[0]?.threadId);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSpace]);

  useEffect(() => {
    if (!activeSpace || !activeFile) return;
    window.basis.files.read(activeSpace.slug, activeFile).then(setActiveContent).catch(() => setActiveContent(""));
  }, [activeSpace, activeFile]);

  useEffect(() => {
    const offFile = window.basis.events.onVaultFileChanged(async (payload) => {
      const changed = payload as { spaceSlug: string; absolutePath: string };
      if (!activeSpace || changed.spaceSlug !== activeSpace.slug) return;
      if (changed.absolutePath.endsWith(activeFile)) {
        const fresh = await window.basis.files.read(activeSpace.slug, activeFile);
        setActiveContent(fresh);
      }
    });
    return () => {
      offFile();
    };
  }, [activeFile, activeSpace]);

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

  const saveActiveFile = useCallback(
    async (nextContent: string) => {
      if (!activeSpace) return;
      setActiveContent(nextContent);
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

  return {
    vaultPath,
    spaces,
    activeSpace,
    fileTree,
    activeFile,
    activeContent,
    threads,
    activeThreadId,
    activeThread,
    setActiveSpace,
    setActiveFile,
    setActiveThreadId,
    refreshSpaces,
    refreshThreads,
    pickVault,
    createSpace,
    openSpace,
    renameSpace,
    deleteSpace,
    saveActiveFile,
    createThread
  };
}
