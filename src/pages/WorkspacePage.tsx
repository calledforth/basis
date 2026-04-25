import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import { Menu, MessageSquare, House, ChevronLeft, X, Maximize, Minimize } from "lucide-react";
import { AcpChatPane } from "../components/AcpChatPane";
import { FileTree } from "../components/FileTree";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { WindowControls } from "../components/TitleBar";
import { FontSwitcher } from "../components/FontSwitcher";
import { typographyLabel } from "../lib/typography";
import type { FileNode, SpaceListItem, ThreadBackend, ThreadRecord } from "../types";
import { HalftoneStudioArt, HALFTONE_HERO_BG_CSS } from "../components/HalftoneStudioArt";

const btnGhost =
  `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 ${typographyLabel} text-neutral-300 transition-colors hover:bg-neutral-900 hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600`;

type WorkspacePageProps = {
  vaultPath: string;
  activeSpace: SpaceListItem;
  fileTree: FileNode[];
  activeFile: string;
  activeContent: string;
  threads: ThreadRecord[];
  activeThreadId: string | undefined;
  activeThread: ThreadRecord | undefined;
  onOpenHome: () => void;
  onSetActiveFile: (path: string) => void;
  onSaveActiveFile: (content: string) => void | Promise<void>;
  onSelectThread: (threadId: string) => void;
  onCreateThread: (opts?: { title?: string; backend?: ThreadBackend }) => void | Promise<void>;
  onRefreshThreads: () => void | Promise<void>;
};

export function WorkspacePage({
  vaultPath,
  activeSpace,
  fileTree,
  activeFile,
  activeContent,
  threads,
  activeThreadId,
  activeThread,
  onOpenHome,
  onSetActiveFile,
  onSaveActiveFile,
  onSelectThread,
  onCreateThread,
  onRefreshThreads
}: WorkspacePageProps) {
  const [editorFileTreeOpen, setEditorFileTreeOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [editorFullWidth, setEditorFullWidth] = useState(false);
  const [workspaceHydrated, setWorkspaceHydrated] = useState(false);
  const [savedMainLayout, setSavedMainLayout] = useState<Layout | undefined>();

  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceHydrated(false);
    setSavedMainLayout(undefined);

    void window.basis.prefs.getSpaceWorkspace(activeSpace.slug).then((p) => {
      if (cancelled) return;
      setChatOpen(p?.chatOpen ?? true);
      setEditorFileTreeOpen(p?.editorFileTreeOpen ?? false);
      // Wait, let's keep it simple. Local state for fullWidth is fine for now, or we can use the same property if we had it.
      // Assuming prefs doesn't have it, we'll just not hydrate it for now to avoid TS errors.
      setSavedMainLayout(
        p?.mainHorizontalLayout && Object.keys(p.mainHorizontalLayout).length ? p.mainHorizontalLayout : undefined
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

  const onMainLayoutChanged = useCallback(
    (layout: Layout) => {
      const slug = activeSpace.slug;
      const hydrated = workspaceHydrated;
      const open = chatOpen;
      clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = setTimeout(() => {
        if (!hydrated || !open) return;
        void window.basis.prefs.setSpaceWorkspace(slug, { mainHorizontalLayout: layout });
      }, 280);
    },
    [activeSpace.slug, chatOpen, workspaceHydrated]
  );

  useEffect(
    () => () => {
      clearTimeout(layoutSaveTimerRef.current);
    },
    []
  );

  const mainDefaultLayout = useMemo((): Layout => {
    if (chatOpen) {
      if (savedMainLayout?.chat != null && savedMainLayout.editor != null) {
        return { chat: savedMainLayout.chat, editor: savedMainLayout.editor };
      }
      return { chat: 30, editor: 70 };
    }
    return { editor: 100 };
  }, [chatOpen, savedMainLayout]);

  const groupMountKey = `${activeSpace.slug}-${workspaceHydrated ? "ready" : "pending"}-${chatOpen ? "chat" : "solo"}`;

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

  const topIconBtn = "title-bar-no-drag inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#bcbcbc] transition-colors hover:bg-[#212121] hover:text-[#e8e8e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5c5c5c]";

  const homeBtn = (
    <button type="button" className={topIconBtn} title="Back to Home" aria-label="Back to Home" onClick={onOpenHome}>
      <ChevronLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} />
    </button>
  );

  const chatToggleBtn = (
    <button
      type="button"
      className={topIconBtn}
      title={chatOpen ? "Close Chat Pane" : "Open Chat Pane"}
      aria-label={chatOpen ? "Close Chat Pane" : "Open Chat Pane"}
      aria-pressed={chatOpen}
      onClick={() => setChatOpen((o) => !o)}
    >
      <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={1.5} fill={chatOpen ? "currentColor" : "none"} />
    </button>
  );

  const closeChatBtn = (
    <button
      type="button"
      className={topIconBtn}
      title="Close Chat Pane"
      aria-label="Close Chat Pane"
      onClick={() => setChatOpen(false)}
    >
      <X className="h-4 w-4 shrink-0" strokeWidth={1.5} />
    </button>
  );

  return (
    <main className="flex h-full min-h-0 flex-col bg-canvas text-neutral-100">
      <Group
        key={groupMountKey}
        orientation="horizontal"
        className="flex min-h-0 flex-1"
        defaultLayout={mainDefaultLayout}
        onLayoutChanged={chatOpen ? onMainLayoutChanged : undefined}
      >
        {chatOpen && (
          <>
            <Panel id="chat" minSize={18} className="flex min-h-0 min-w-0 flex-col bg-canvas">
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
                  <div className="title-bar-no-drag flex items-center h-full pl-0.5">
                    {homeBtn}
                    {chatToggleBtn}
                  </div>
                }
                headerControlsRight={
                  <div className="title-bar-no-drag flex items-center h-full pr-0.5">
                    {closeChatBtn}
                  </div>
                }
              />
            </Panel>

            <Separator className="group relative flex w-px shrink-0 justify-center bg-transparent">
              <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-neutral-800 transition-colors group-hover:bg-neutral-600" />
            </Separator>
          </>
        )}

        <Panel id="editor" minSize={32} className="flex min-h-0 min-w-0 flex-col bg-canvas">
          <div className="title-bar-drag flex h-8 shrink-0 items-center justify-between border-b border-neutral-800 bg-canvas">
            <div className="flex items-center h-full">
              {!chatOpen && (
                <div className="title-bar-no-drag flex items-center h-full pl-0.5 pr-1">
                  {homeBtn}
                  {chatToggleBtn}
                </div>
              )}
              
              <div className="flex items-center gap-2 px-3 h-full">
                <button
                  type="button"
                  aria-label={editorFileTreeOpen ? "Hide file sidebar" : "Show file sidebar"}
                  aria-pressed={editorFileTreeOpen}
                  className={`title-bar-no-drag ${btnGhost} !p-1.5 text-neutral-400 hover:text-neutral-200 ${editorFileTreeOpen ? "bg-neutral-900 text-neutral-100" : ""}`}
                  onClick={() => setEditorFileTreeOpen((o) => !o)}
                >
                  <Menu className="h-4 w-4 shrink-0" strokeWidth={2} />
                </button>
              </div>

              {/* Active File Tab */}
              <div className="title-bar-no-drag flex h-full items-center justify-center border-b-[1.5px] border-[#bcbcbc] px-4 transition-colors hover:bg-neutral-900 cursor-pointer">
                <span className={`min-w-0 max-w-[20rem] truncate ${typographyLabel} text-[#bcbcbc]`} title={activeFile}>
                  {activeFile}
                </span>
              </div>
            </div>
            <div className="title-bar-no-drag flex items-center h-full">
              <button
                type="button"
                className={topIconBtn}
                title={editorFullWidth ? "Standard Width" : "Full Width"}
                aria-label={editorFullWidth ? "Standard Width" : "Full Width"}
                onClick={() => setEditorFullWidth((o) => !o)}
              >
                {editorFullWidth ? (
                  <Minimize className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                ) : (
                  <Maximize className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                )}
              </button>
              <FontSwitcher />
              <WindowControls />
            </div>
          </div>
          <div className="flex min-h-0 flex-1 relative">
            {editorFileTreeOpen ? (
              <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-800 bg-canvas p-2">
                <FileTree nodes={fileTree} activeFile={activeFile} onPick={onSetActiveFile} />
              </nav>
            ) : null}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
              <MarkdownEditor
                value={activeContent}
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
