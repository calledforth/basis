import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, usePanelRef, type Layout } from "react-resizable-panels";
import { Expand, Menu, MessageSquare, ChevronLeft, Shrink, X } from "lucide-react";
import { VscNewFile, VscNewFolder, VscTrash } from "react-icons/vsc";
import { fileTabDisplayName } from "../lib/filePathGlyph";
import { btnIcon } from "../components/acp-chat/uiPrimitives";
import { AcpChatPane } from "../components/AcpChatPane";
import { FileTree } from "../components/FileTree";
import type { FileTreeFileActions } from "../components/FileTree";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { WindowControls } from "../components/TitleBar";
import { FontSwitcher } from "../components/FontSwitcher";
import type { FileNode, SpaceListItem, ThreadBackend, ThreadRecord, WorkspaceLayoutMode } from "../types";
import { HalftoneStudioArt } from "../components/HalftoneStudioArt";

type WorkspacePageProps = {
  vaultPath: string;
  activeSpace: SpaceListItem;
  fileTree: FileNode[];
  openFiles: string[];
  activeFile: string;
  activeContent: string;
  threads: ThreadRecord[];
  activeThreadId: string | undefined;
  activeThread: ThreadRecord | undefined;
  workspaceLayout: WorkspaceLayoutMode;
  onWorkspaceLayoutChange: (mode: WorkspaceLayoutMode) => void;
  onOpenHome: () => void;
  onSetActiveFile: (path: string) => void;
  onCloseFile: (path: string) => void;
  onSaveActiveFile: (content: string) => void | Promise<void>;
  onSelectThread: (threadId: string) => void;
  onCreateThread: (opts?: { title?: string; backend?: ThreadBackend }) => void | Promise<void>;
  onRefreshThreads: () => void | Promise<void>;
  fileTreeActions: FileTreeFileActions | null;
};

function flattenAllPaths(nodes: FileNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (node: FileNode) => {
    out.add(node.path);
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function nextRootPath(stem: string, ext: string, taken: Set<string>) {
  let idx = 0;
  for (;;) {
    const name = idx === 0 ? `${stem}${ext}` : `${stem}-${idx}${ext}`;
    if (!taken.has(name)) return name;
    idx += 1;
  }
}

function compactDeletePaths(paths: string[]): string[] {
  const normalized = [...new Set(paths.filter(Boolean).map((p) => p.replaceAll("\\", "/").replace(/\/+$/, "")))];
  normalized.sort((a, b) => a.length - b.length);
  const out: string[] = [];
  for (const path of normalized) {
    const covered = out.some((parent) => path === parent || path.startsWith(`${parent}/`));
    if (!covered) out.push(path);
  }
  return out;
}

function isLayoutComplete(layout: Layout | undefined, ids: string[]) {
  if (!layout) return false;
  return ids.every((id) => typeof layout[id] === "number");
}

export function WorkspacePage({
  vaultPath,
  activeSpace,
  fileTree,
  openFiles,
  activeFile,
  activeContent,
  threads,
  activeThreadId,
  activeThread,
  workspaceLayout,
  onWorkspaceLayoutChange,
  onOpenHome,
  onSetActiveFile,
  onCloseFile,
  onSaveActiveFile,
  onSelectThread,
  onCreateThread,
  onRefreshThreads,
  fileTreeActions
}: WorkspacePageProps) {
  const [editorFileTreeOpen, setEditorFileTreeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [editorFullWidth, setEditorFullWidth] = useState(false);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [savedMainLayout, setSavedMainLayout] = useState<Layout | undefined>();
  const [savedColumnsLayout, setSavedColumnsLayout] = useState<Layout | undefined>();
  const [selectedTreePaths, setSelectedTreePaths] = useState<string[]>([]);

  const mainLayoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const columnsLayoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const classicChatPanelRef = usePanelRef();
  const columnsTreePanelRef = usePanelRef();
  const columnsChatPanelRef = usePanelRef();

  useEffect(() => {
    let cancelled = false;
    setWorkspaceHydrated(false);
    setSavedMainLayout(undefined);
    setSavedColumnsLayout(undefined);
    setSelectedTreePaths([]);

    void window.basis.prefs.getSpaceWorkspace(activeSpace.slug).then((p) => {
      if (cancelled) return;
      setChatOpen(p?.chatOpen ?? true);
      setEditorFileTreeOpen(p?.editorFileTreeOpen ?? true);
      setSavedMainLayout(
        p?.mainHorizontalLayout && Object.keys(p.mainHorizontalLayout).length ? p.mainHorizontalLayout : undefined
      );
      setSavedColumnsLayout(
        p?.columnsLayout && Object.keys(p.columnsLayout).length ? p.columnsLayout : undefined
      );
      setWorkspaceHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [activeSpace.slug]);

  useEffect(() => {
    if (!workspaceHydrated) return;
    void window.basis.prefs.setSpaceWorkspace(activeSpace.slug, {
      chatOpen,
      editorFileTreeOpen
    });
  }, [activeSpace.slug, chatOpen, editorFileTreeOpen, workspaceHydrated]);

  const onClassicLayoutChanged = useCallback(
    (layout: Layout) => {
      const slug = activeSpace.slug;
      const hydrated = workspaceHydrated;
      clearTimeout(mainLayoutSaveTimerRef.current);
      mainLayoutSaveTimerRef.current = setTimeout(() => {
        if (!hydrated) return;
        void window.basis.prefs.setSpaceWorkspace(slug, { mainHorizontalLayout: layout });
      }, 280);
    },
    [activeSpace.slug, workspaceHydrated]
  );

  const onColumnsLayoutChanged = useCallback(
    (layout: Layout) => {
      const slug = activeSpace.slug;
      const hydrated = workspaceHydrated;
      clearTimeout(columnsLayoutSaveTimerRef.current);
      columnsLayoutSaveTimerRef.current = setTimeout(() => {
        if (!hydrated) return;
        void window.basis.prefs.setSpaceWorkspace(slug, { columnsLayout: layout });
      }, 280);
    },
    [activeSpace.slug, workspaceHydrated]
  );

  useEffect(
    () => () => {
      clearTimeout(mainLayoutSaveTimerRef.current);
      clearTimeout(columnsLayoutSaveTimerRef.current);
    },
    []
  );

  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      const homeEl = document.querySelector('[data-debug-icon="workspace-home"]') as HTMLElement | null;
      const chatEl = document.querySelector('[data-debug-icon="workspace-chat"]') as HTMLElement | null;
      const menuEl = document.querySelector('[data-debug-icon="workspace-menu"]') as HTMLElement | null;
      const parent = homeEl?.parentElement as HTMLElement | null;
      const titleRow = homeEl?.closest(".title-bar-drag") as HTMLElement | null;
      const homeRect = homeEl?.getBoundingClientRect();
      const chatRect = chatEl?.getBoundingClientRect();
      const menuRect = menuEl?.getBoundingClientRect();
      const parentRect = parent?.getBoundingClientRect();
      const titleRect = titleRow?.getBoundingClientRect();
      const parentStyle = parent ? getComputedStyle(parent) : null;
      const titleStyle = titleRow ? getComputedStyle(titleRow) : null;
      const iconGap = homeRect && chatRect ? Number((chatRect.left - homeRect.right).toFixed(2)) : null;
      const hostOffset = homeRect && titleRect ? Number((homeRect.left - titleRect.left).toFixed(2)) : null;
      const triadWidth = homeRect && menuRect ? Number((menuRect.right - homeRect.left).toFixed(2)) : null;
      const roleCounts = {
        home: document.querySelectorAll('[data-debug-icon="workspace-home"]').length,
        chat: document.querySelectorAll('[data-debug-icon="workspace-chat"]').length,
        menu: document.querySelectorAll('[data-debug-icon="workspace-menu"]').length
      };

      // #region agent log
      fetch("http://127.0.0.1:7282/ingest/67b24953-519f-4630-ad16-3cf215f2ca00", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1a9b8a" },
        body: JSON.stringify({
          sessionId: "1a9b8a",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "src/pages/WorkspacePage.tsx:layout-effect",
          message: "Icon triad absolute placement",
          data: {
            workspaceLayout,
            chatOpen,
            editorFileTreeOpen,
            homeLeft: homeRect?.left ?? null,
            chatLeft: chatRect?.left ?? null,
            menuLeft: menuRect?.left ?? null,
            hostOffset,
            triadWidth
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

      // #region agent log
      fetch("http://127.0.0.1:7282/ingest/67b24953-519f-4630-ad16-3cf215f2ca00", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1a9b8a" },
        body: JSON.stringify({
          sessionId: "1a9b8a",
          runId: "pre-fix",
          hypothesisId: "H2",
          location: "src/pages/WorkspacePage.tsx:layout-effect",
          message: "Icon cluster parent spacing",
          data: {
            parentClass: parent?.className ?? null,
            parentPaddingLeft: parentStyle?.paddingLeft ?? null,
            parentPaddingRight: parentStyle?.paddingRight ?? null,
            parentGap: parentStyle?.gap ?? null,
            parentLeft: parentRect?.left ?? null
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

      // #region agent log
      fetch("http://127.0.0.1:7282/ingest/67b24953-519f-4630-ad16-3cf215f2ca00", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1a9b8a" },
        body: JSON.stringify({
          sessionId: "1a9b8a",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "src/pages/WorkspacePage.tsx:layout-effect",
          message: "Title row spacing context",
          data: {
            titleClass: titleRow?.className ?? null,
            titlePaddingLeft: titleStyle?.paddingLeft ?? null,
            titlePaddingRight: titleStyle?.paddingRight ?? null,
            titleWidth: titleRect?.width ?? null
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion

      // #region agent log
      fetch("http://127.0.0.1:7282/ingest/67b24953-519f-4630-ad16-3cf215f2ca00", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "1a9b8a" },
        body: JSON.stringify({
          sessionId: "1a9b8a",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "src/pages/WorkspacePage.tsx:layout-effect",
          message: "Duplicate icon role count and internal gap",
          data: {
            roleCounts,
            iconGap,
            homeExists: Boolean(homeEl),
            chatExists: Boolean(chatEl),
            menuExists: Boolean(menuEl)
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
    });
    return () => cancelAnimationFrame(id);
  }, [workspaceLayout, chatOpen, editorFileTreeOpen, workspaceHydrated]);

  const classicDefaultLayout = useMemo((): Layout => {
    if (isLayoutComplete(savedMainLayout, ["chat", "editor"])) {
      return { chat: savedMainLayout!.chat!, editor: savedMainLayout!.editor! };
    }
    return { chat: 28, editor: 72 };
  }, [savedMainLayout]);

  const columnsDefaultLayout = useMemo((): Layout => {
    if (isLayoutComplete(savedColumnsLayout, ["tree", "chat", "editor"])) {
      return {
        tree: savedColumnsLayout!.tree!,
        chat: savedColumnsLayout!.chat!,
        editor: savedColumnsLayout!.editor!
      };
    }
    return { tree: 20, chat: 28, editor: 52 };
  }, [savedColumnsLayout]);

  const classicGroupKey = `${activeSpace.slug}-${workspaceHydrated ? "ready" : "pending"}-classic`;
  const columnsGroupKey = `${activeSpace.slug}-${workspaceHydrated ? "ready" : "pending"}-columns`;

  useLayoutEffect(() => {
    if (!workspaceHydrated || workspaceLayout !== "classic") return;
    const id = requestAnimationFrame(() => {
      const p = classicChatPanelRef.current;
      if (!p) return;
      if (chatOpen) p.expand();
      else p.collapse();
    });
    return () => cancelAnimationFrame(id);
  }, [chatOpen, workspaceHydrated, workspaceLayout]);

  useLayoutEffect(() => {
    if (!workspaceHydrated || workspaceLayout !== "columns") return;
    const id = requestAnimationFrame(() => {
      const t = columnsTreePanelRef.current;
      if (!t) return;
      if (editorFileTreeOpen) t.expand();
      else t.collapse();
    });
    return () => cancelAnimationFrame(id);
  }, [editorFileTreeOpen, workspaceHydrated, workspaceLayout]);

  useLayoutEffect(() => {
    if (!workspaceHydrated || workspaceLayout !== "columns") return;
    const id = requestAnimationFrame(() => {
      const c = columnsChatPanelRef.current;
      if (!c) return;
      if (chatOpen) c.expand();
      else c.collapse();
    });
    return () => cancelAnimationFrame(id);
  }, [chatOpen, editorFileTreeOpen, workspaceHydrated, workspaceLayout]);

  const isOverview = activeFile.toLowerCase().includes("overview.md");

  const overviewBanner = isOverview ? (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] overflow-hidden select-none z-0" aria-hidden>
      <HalftoneStudioArt
        className="relative z-0 h-full w-full opacity-30 mix-blend-screen"
        configOverride={{
          cellSize: 8,
          sourceComplexity: 0.1,
          contrast: 0.8,
          brightness: 0.1,
          dotScale: 1.0,
          speed: 0.3
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-canvas/40 to-canvas" />
    </div>
  ) : null;

  const knownPaths = useMemo(() => flattenAllPaths(fileTree), [fileTree]);

  const runTreeAction = useCallback(async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "File operation failed.";
      window.alert(message);
    }
  }, []);

  const createRootFile = useCallback(() => {
    if (!fileTreeActions) return;
    const relPath = nextRootPath("untitled", ".md", knownPaths);
    setEditorFileTreeOpen(true);
    void runTreeAction(async () => {
      await fileTreeActions.createFile(relPath);
      onSetActiveFile(relPath);
    });
  }, [fileTreeActions, knownPaths, onSetActiveFile, runTreeAction]);

  const createRootFolder = useCallback(() => {
    if (!fileTreeActions) return;
    const relPath = nextRootPath("new-folder", "", knownPaths);
    setEditorFileTreeOpen(true);
    void runTreeAction(async () => {
      await fileTreeActions.mkdir(relPath);
    });
  }, [fileTreeActions, knownPaths, runTreeAction]);

  const deleteSelected = useCallback(() => {
    if (!fileTreeActions || selectedTreePaths.length === 0) return;
    const targets = compactDeletePaths(selectedTreePaths);
    void runTreeAction(async () => {
      for (const relPath of targets) {
        await fileTreeActions.remove(relPath);
      }
    });
  }, [fileTreeActions, runTreeAction, selectedTreePaths]);

  const homeBtn = (
    <button
      type="button"
      data-debug-icon="workspace-home"
      className={`title-bar-no-drag ${btnIcon}`}
      title="Back to Home"
      aria-label="Back to Home"
      onClick={onOpenHome}
    >
      <ChevronLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
    </button>
  );

  const chatToggleBtn = (
    <button
      type="button"
      data-debug-icon="workspace-chat"
      className={`title-bar-no-drag ${btnIcon}`}
      title={chatOpen ? "Close Chat Pane" : "Open Chat Pane"}
      aria-label={chatOpen ? "Close Chat Pane" : "Open Chat Pane"}
      aria-pressed={chatOpen}
      onClick={() => setChatOpen((o) => !o)}
    >
      <MessageSquare className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} fill={chatOpen ? "currentColor" : "none"} />
    </button>
  );

  const closeChatBtn = (
    <button
      type="button"
      className={`title-bar-no-drag ${btnIcon}`}
      title="Close Chat Pane"
      aria-label="Close Chat Pane"
      onClick={() => setChatOpen(false)}
    >
      <X className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
    </button>
  );

  const acpChatPaneEl = (
    <AcpChatPane
      vaultPath={vaultPath}
      spaceSlug={activeSpace.slug}
      threads={threads}
      activeThreadId={activeThreadId}
      activeThread={activeThread}
      onSelectThread={onSelectThread}
      onOpenWorkspaceFile={(relPath) => onSetActiveFile(relPath)}
      onSpawnSubagentThread={async ({ title, backendSessionId, backend }) => {
        const rec = await window.basis.threads.create(activeSpace.slug, {
          title,
          backend
        });
        await window.basis.threads.update(activeSpace.slug, rec.threadId, {
          backendSessionId,
          status: "ready",
          title
        });
        await onRefreshThreads();
        onSelectThread(rec.threadId);
      }}
      onNewChat={(opts) => void onCreateThread(opts)}
      onThreadsUpdated={onRefreshThreads}
      headerControlsLeft={
        workspaceLayout === "columns" && !editorFileTreeOpen && chatOpen ? (
          <div className="title-bar-no-drag flex h-full shrink-0 items-center gap-0 pl-0 pr-0">
            {homeBtn}
            {chatToggleBtn}
            <button
              type="button"
              data-debug-icon="workspace-menu"
              aria-label={editorFileTreeOpen ? "Collapse files column" : "Expand files column"}
              aria-pressed={editorFileTreeOpen}
              className={`shrink-0 ${btnIcon} ${
                editorFileTreeOpen
                  ? "bg-[var(--basis-surface-hover)] !text-[var(--basis-text)] hover:!bg-[var(--basis-surface-hover)] hover:!text-[var(--basis-text)]"
                  : ""
              }`}
              onClick={() => setEditorFileTreeOpen((o) => !o)}
            >
              <Menu className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            </button>
          </div>
        ) : undefined
      }
      headerControlsRight={
        <div className="title-bar-no-drag flex h-full items-center pr-0">{closeChatBtn}</div>
      }
    />
  );

  const fontSwitcherEl = (
    <FontSwitcher
      variant="sidebar"
      workspaceLayout={workspaceLayout}
      onWorkspaceLayoutChange={onWorkspaceLayoutChange}
    />
  );

  const leftRailClassClassic = `title-bar-no-drag flex h-full min-w-0 shrink-0 items-stretch border-r border-neutral-800 ${
    editorFileTreeOpen ? "w-56 pl-0 pr-1" : "w-auto flex-initial pl-0 pr-1"
  }`;
  const leftRailInnerClassClassic = `flex h-full w-full min-w-0 flex-nowrap items-center ${
    editorFileTreeOpen ? "gap-0" : "justify-start gap-0 px-0"
  }`;

  const columnsTreeToggleBtn = (
    <button
      type="button"
      data-debug-icon="workspace-menu"
      aria-label={editorFileTreeOpen ? "Collapse files column" : "Expand files column"}
      aria-pressed={editorFileTreeOpen}
      className={`shrink-0 ${btnIcon} ${
        editorFileTreeOpen
          ? "bg-[var(--basis-surface-hover)] !text-[var(--basis-text)] hover:!bg-[var(--basis-surface-hover)] hover:!text-[var(--basis-text)]"
          : ""
      }`}
      onClick={() => setEditorFileTreeOpen((o) => !o)}
    >
      <Menu className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
    </button>
  );

  const columnsPrimaryControls = (
    <>
      {homeBtn}
      {chatToggleBtn}
      {columnsTreeToggleBtn}
    </>
  );

  const columnsCreateControls = (
    <>
      <button type="button" className={btnIcon} aria-label="New file" title="New file" disabled={!fileTreeActions} onClick={createRootFile}>
        <VscNewFile className="h-3.5 w-3.5 text-[var(--basis-text)]" />
      </button>
      <button type="button" className={btnIcon} aria-label="New folder" title="New folder" disabled={!fileTreeActions} onClick={createRootFolder}>
        <VscNewFolder className="h-3.5 w-3.5 text-[var(--basis-text)]" />
      </button>
    </>
  );

  if (workspaceLayout === "columns") {
    return (
      <main className="flex h-full min-h-0 flex-col bg-canvas text-neutral-100">
        <Group
          key={columnsGroupKey}
          orientation="horizontal"
          className="flex min-h-0 flex-1"
          defaultLayout={columnsDefaultLayout}
          onLayoutChanged={onColumnsLayoutChanged}
        >
          <Panel
            id="tree"
            panelRef={columnsTreePanelRef}
            collapsible
            collapsedSize={0}
            minSize={14}
            defaultSize={columnsDefaultLayout.tree as number}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-canvas"
          >
            <div className="title-bar-drag flex h-8 shrink-0 items-center gap-1 border-b border-neutral-800 bg-canvas px-1">
              <div className="title-bar-no-drag flex h-full shrink-0 items-center gap-0 pl-0 pr-0">
                {editorFileTreeOpen ? columnsPrimaryControls : null}
              </div>
              <div className="title-bar-drag min-h-[32px] min-w-[12px] flex-1" aria-hidden />
              <div className="title-bar-no-drag flex shrink-0 items-center gap-0.5">
                {editorFileTreeOpen ? columnsCreateControls : null}
                <button
                  type="button"
                  className={`${btnIcon} enabled:hover:text-red-400 enabled:hover:[&_svg]:text-red-400`}
                  aria-label="Delete selected"
                  title={
                    selectedTreePaths.length > 0 ? `Delete selected (${selectedTreePaths.length})` : "Select files or folders to delete"
                  }
                  disabled={!fileTreeActions || selectedTreePaths.length === 0}
                  onClick={deleteSelected}
                >
                  <VscTrash className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-0">
                <FileTree
                  key={activeSpace.slug}
                  id={activeSpace.slug}
                  nodes={fileTree}
                  activeFile={activeFile}
                  onPick={onSetActiveFile}
                  fileActions={fileTreeActions}
                  onSelectionPathsChange={setSelectedTreePaths}
                />
              </div>
              <div className="shrink-0 border-t border-neutral-800/90 px-1.5 py-1.5">
                <div className="min-w-0">{fontSwitcherEl}</div>
              </div>
            </div>
          </Panel>
          <Separator className="group relative flex w-px shrink-0 justify-center bg-transparent">
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--basis-border)] transition-colors group-hover:bg-[var(--basis-text-muted)]" />
          </Separator>
          <Panel
            id="chat"
            panelRef={columnsChatPanelRef}
            collapsible
            collapsedSize={0}
            minSize={18}
            defaultSize={columnsDefaultLayout.chat as number}
            className="flex min-h-0 min-w-0 flex-col bg-canvas"
          >
            {acpChatPaneEl}
          </Panel>
          <Separator className="group relative flex w-px shrink-0 justify-center bg-transparent">
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--basis-border)] transition-colors group-hover:bg-[var(--basis-text-muted)]" />
          </Separator>
          <Panel id="editor" minSize={32} defaultSize={columnsDefaultLayout.editor as number} className="flex min-h-0 min-w-0 flex-col bg-canvas">
            <div className="title-bar-drag flex h-8 shrink-0 items-center justify-between border-b border-neutral-800/90 bg-canvas">
              <div className="title-bar-no-drag flex min-h-0 min-w-0 flex-1 items-stretch">
                <div className="flex min-h-0 min-w-0 flex-1 items-center px-1">
                  {!editorFileTreeOpen && !chatOpen ? (
                    <div className="title-bar-no-drag flex h-full shrink-0 items-center gap-0 pl-0 pr-0">{columnsPrimaryControls}</div>
                  ) : null}
                  <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
                    <div className="flex h-full min-w-full items-stretch">
                      {openFiles.map((path) => {
                        const isActive = path === activeFile;
                        return (
                          <div
                            key={path}
                            className={`group flex h-full min-w-0 w-56 max-w-80 shrink-0 items-center gap-1 border-r border-neutral-800/90 px-2 ${
                              isActive
                                ? "bg-[var(--basis-tab-active-bg)] text-neutral-100"
                                : "bg-transparent text-neutral-400 hover:bg-[var(--basis-surface-hover)] hover:text-neutral-200"
                            }`}
                          >
                            <button
                              type="button"
                              className={`min-w-0 flex-1 truncate py-1 text-left text-[12.5px] font-medium leading-tight tracking-[-0.01em] ${
                                isActive ? "text-neutral-100" : "text-neutral-400"
                              }`}
                              title={path}
                              onClick={() => onSetActiveFile(path)}
                            >
                              {fileTabDisplayName(path)}
                            </button>
                            <button type="button" className={`${btnIcon} shrink-0`} aria-label={`Close ${path}`} onClick={() => onCloseFile(path)}>
                              <X className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="title-bar-no-drag flex h-full shrink-0 items-center">
                <button
                  type="button"
                  className={btnIcon}
                  title={editorFullWidth ? "Standard Width" : "Full Width"}
                  aria-label={editorFullWidth ? "Standard Width" : "Full Width"}
                  onClick={() => setEditorFullWidth((o) => !o)}
                >
                  {editorFullWidth ? (
                    <Shrink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  ) : (
                    <Expand className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                  )}
                </button>
                <WindowControls />
              </div>
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
              <MarkdownEditor
                value={activeContent}
                filePath={activeFile || undefined}
                onSave={onSaveActiveFile}
                fullWidth={editorFullWidth}
                banner={overviewBanner}
              />
            </div>
          </Panel>
        </Group>
      </main>
    );
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-canvas text-neutral-100">
      <Group
        key={classicGroupKey}
        orientation="horizontal"
        className="flex min-h-0 flex-1"
        defaultLayout={classicDefaultLayout}
        onLayoutChanged={onClassicLayoutChanged}
      >
        <Panel
          id="chat"
          panelRef={classicChatPanelRef}
          collapsible
          collapsedSize={0}
          minSize={18}
          defaultSize={classicDefaultLayout.chat as number}
          className="flex min-h-0 min-w-0 flex-col bg-canvas"
        >
          {acpChatPaneEl}
        </Panel>
        <Separator className="group relative flex w-px shrink-0 justify-center bg-transparent">
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--basis-border)] transition-colors group-hover:bg-[var(--basis-text-muted)]" />
        </Separator>
        <Panel id="editor" minSize={32} defaultSize={classicDefaultLayout.editor as number} className="flex min-h-0 min-w-0 flex-col bg-canvas">
          <div className="title-bar-drag flex h-8 shrink-0 items-center justify-between border-b border-neutral-800/90 bg-canvas">
            <div className="flex min-h-0 min-w-0 flex-1 items-stretch">
              <div className={leftRailClassClassic}>
                <div className={leftRailInnerClassClassic}>
                  {homeBtn}
                  {chatToggleBtn}
                  <button
                    type="button"
                    data-debug-icon="workspace-menu"
                    aria-label={editorFileTreeOpen ? "Hide file sidebar" : "Show file sidebar"}
                    aria-pressed={editorFileTreeOpen}
                    className={`shrink-0 ${btnIcon} ${
                      editorFileTreeOpen
                        ? "bg-[var(--basis-surface-hover)] !text-[var(--basis-text)] hover:!bg-[var(--basis-surface-hover)] hover:!text-[var(--basis-text)]"
                        : ""
                    }`}
                    onClick={() => setEditorFileTreeOpen((o) => !o)}
                  >
                    <Menu className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                  </button>
                  {editorFileTreeOpen ? (
                    <>
                      <div className="min-w-0 flex-1" aria-hidden />
                      <div className="flex min-w-0 max-w-full shrink-0 items-center gap-0.5">
                        <button type="button" className={btnIcon} aria-label="New file" title="New file" disabled={!fileTreeActions} onClick={createRootFile}>
                          <VscNewFile className="h-3.5 w-3.5 text-[var(--basis-text)]" />
                        </button>
                        <button type="button" className={btnIcon} aria-label="New folder" title="New folder" disabled={!fileTreeActions} onClick={createRootFolder}>
                          <VscNewFolder className="h-3.5 w-3.5 text-[var(--basis-text)]" />
                        </button>
                        <button
                          type="button"
                          className={`${btnIcon} enabled:hover:text-red-400 enabled:hover:[&_svg]:text-red-400`}
                          aria-label="Delete selected"
                          title={
                            selectedTreePaths.length > 0 ? `Delete selected (${selectedTreePaths.length})` : "Select files or folders to delete"
                          }
                          disabled={!fileTreeActions || selectedTreePaths.length === 0}
                          onClick={deleteSelected}
                        >
                          <VscTrash className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="title-bar-no-drag flex min-h-0 min-w-0 flex-1 items-stretch">
                <div className="flex min-h-0 min-w-0 flex-1 items-center px-1">
                  <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
                    <div className="flex h-full min-w-full items-stretch">
                      {openFiles.map((path) => {
                        const isActive = path === activeFile;
                        return (
                          <div
                            key={path}
                            className={`group flex h-full min-w-0 w-56 max-w-80 shrink-0 items-center gap-1 border-r border-neutral-800/90 px-2 ${
                              isActive
                                ? "bg-[var(--basis-tab-active-bg)] text-neutral-100"
                                : "bg-transparent text-neutral-400 hover:bg-[var(--basis-surface-hover)] hover:text-neutral-200"
                            }`}
                          >
                            <button
                              type="button"
                              className={`min-w-0 flex-1 truncate py-1 text-left text-[12.5px] font-medium leading-tight tracking-[-0.01em] ${
                                isActive ? "text-neutral-100" : "text-neutral-400"
                              }`}
                              title={path}
                              onClick={() => onSetActiveFile(path)}
                            >
                              {fileTabDisplayName(path)}
                            </button>
                            <button type="button" className={`${btnIcon} shrink-0`} aria-label={`Close ${path}`} onClick={() => onCloseFile(path)}>
                              <X className="h-3.5 w-3.5" strokeWidth={2} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="title-bar-no-drag flex h-full shrink-0 items-center">
              <button
                type="button"
                className={btnIcon}
                title={editorFullWidth ? "Standard Width" : "Full Width"}
                aria-label={editorFullWidth ? "Standard Width" : "Full Width"}
                onClick={() => setEditorFullWidth((o) => !o)}
              >
                {editorFullWidth ? (
                  <Shrink className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                ) : (
                  <Expand className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                )}
              </button>
              <WindowControls />
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1">
            {editorFileTreeOpen ? (
              <nav className="flex h-full min-h-0 w-56 shrink-0 flex-col border-r border-neutral-800 bg-canvas">
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden p-0">
                  <FileTree
                    key={activeSpace.slug}
                    id={activeSpace.slug}
                    nodes={fileTree}
                    activeFile={activeFile}
                    onPick={onSetActiveFile}
                    fileActions={fileTreeActions}
                    onSelectionPathsChange={setSelectedTreePaths}
                  />
                </div>
                <div className="shrink-0 border-t border-neutral-800/90 px-1.5 py-1.5">
                  <div className="min-w-0">{fontSwitcherEl}</div>
                </div>
              </nav>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
              <MarkdownEditor
                value={activeContent}
                filePath={activeFile || undefined}
                onSave={onSaveActiveFile}
                fullWidth={editorFullWidth}
                banner={overviewBanner}
              />
            </div>
          </div>
        </Panel>
      </Group>
    </main>
  );
}
