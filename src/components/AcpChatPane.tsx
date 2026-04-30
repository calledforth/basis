import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LegendList } from "@legendapp/list/react";
import { Box, BookOpen, Plug, Brain, ChevronLeft, Image as ImageIcon } from "lucide-react";
import type {
  AcpPermissionResponseOutcome,
  AcpTranslatedEvent,
  ThreadBackend,
  ThreadRecord,
} from "../types";
import {
  deriveConnectionDot,
  foldAcpEvents,
  type FoldedChatRow,
} from "../lib/foldAcpEvents";
import {
  deriveSessionChromeState,
  modeChipTheme,
} from "../lib/acpSessionChrome";
import {
  AcpChatUiProvider,
  type AcpChatUiContextValue,
  ACP_CHAT_DISMISS_POPOVERS_EVENT,
} from "./acpChatUiContext";
import {
  btnSend,
  chatComposerTextarea,
  chatUserInner,
  chatInputShell,
  COMPOSER_TEXTAREA_MAX_PX,
  COMPOSER_TEXTAREA_MIN_PX,
} from "./chatComposerStyles";
import {
  typographyBody,
  typographyCaption,
  typographyLabel,
} from "../lib/typography";
import { ChatRowView } from "./acp-chat/chatRows";
import {
  CHAT_GUTTER_PX,
  CHAT_SCROLLBAR_COMPENSATION_PX,
  ConnectionDotIndicator,
  IconBolt,
  IconChevronDown,
  IconChevronRight,
  IconHistory,
  IconPlus,
  IconSend,
  IconStop,
  MarkdownMessage,
  backendLabel,
  btnIcon,
  formatModelName,
  getModeIcon,
  joinFs,
  titleBtnIcon,
} from "./acp-chat/uiPrimitives";

type PendingUserMessage = {
  id: string;
  text: string;
};
export type AcpChatPaneProps = {
  vaultPath: string;
  spaceSlug: string;
  threads: ThreadRecord[];
  activeThreadId: string | undefined;
  activeThread: ThreadRecord | undefined;
  onSelectThread: (threadId: string) => void;
  onOpenWorkspaceFile: (relPath: string) => void;
  onSpawnSubagentThread: (args: {
    title: string;
    backend: ThreadBackend;
    backendSessionId?: string;
  }) => void | Promise<void>;
  onNewChat: (opts?: { title?: string; backend?: ThreadBackend }) => void | Promise<void>;
  onThreadsUpdated: () => void | Promise<void>;
  headerControlsLeft?: ReactNode;
  headerControlsRight?: ReactNode;
};

export function AcpChatPane({
  vaultPath,
  spaceSlug,
  threads,
  activeThreadId,
  activeThread,
  onSelectThread,
  onOpenWorkspaceFile,
  onSpawnSubagentThread,
  onNewChat,
  onThreadsUpdated,
  headerControlsLeft,
  headerControlsRight,
}: AcpChatPaneProps) {
  const [events, setEvents] = useState<AcpTranslatedEvent[]>([]);
  const [prompt, setPrompt] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [plusPanel, setPlusPanel] = useState<
    "root" | "skills" | "models" | "options"
  >("root");
  const [commandQuery, setCommandQuery] = useState("");
  const [usageHoverOpen, setUsageHoverOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [debugDetachedPermissions, setDebugDetachedPermissions] =
    useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [settledPermissions, setSettledPermissions] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingUserMessages, setPendingUserMessages] = useState<
    PendingUserMessage[]
  >([]);

  useEffect(() => {
    const pending = sessionStorage.getItem("basis-pending-prompt");
    if (pending) {
      sessionStorage.removeItem("basis-pending-prompt");
      setPrompt(pending);
    }
  }, []);

  const historyRef = useRef<HTMLDivElement>(null);
  const newChatRef = useRef<HTMLDivElement>(null);
  const plusRef = useRef<HTMLDivElement>(null);
  const usageRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const threadId = activeThreadId;
  const spaceRoot = useMemo(
    () => joinFs(vaultPath, spaceSlug),
    [vaultPath, spaceSlug],
  );

  const syncComposerHeight = useCallback(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const clamped = Math.min(
      Math.max(scrollH, COMPOSER_TEXTAREA_MIN_PX),
      COMPOSER_TEXTAREA_MAX_PX,
    );
    el.style.height = `${clamped}px`;
    el.style.overflowY = scrollH > COMPOSER_TEXTAREA_MAX_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncComposerHeight();
    const el = promptRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => syncComposerHeight());
    observer.observe(el);
    return () => observer.disconnect();
  }, [prompt, threadId, syncComposerHeight]);

  useEffect(() => {
    setSettledPermissions(new Set());
    setEvents([]);
    setPendingUserMessages([]);
    if (!threadId) return;

    let cancelled = false;
    void window.basis.acp
      .listEvents({ spaceSlug, threadId })
      .then((list) => {
        if (cancelled) return;
        setEvents(list);
      })
      .catch(() => undefined);

    const off = window.basis.events.onAcpEvent((payload) => {
      const e = payload as AcpTranslatedEvent;
      if (e.spaceSlug !== spaceSlug || e.threadId !== threadId) return;
      if (e.event === "rpc_error") {
        const d = e.data && typeof e.data === "object" ? (e.data as Record<string, unknown>) : null;
        const userMessage =
          typeof d?.userMessage === "string"
            ? d.userMessage
            : typeof d?.message === "string"
              ? d.message
              : null;
        if (userMessage) setNotice(userMessage);
      }
      setEvents((prev) => {
        if (prev.some((x) => x.id === e.id)) return prev;
        return [...prev, e];
      });
      if (e.event === "prompt_started") {
        setPendingUserMessages((prev) => prev.slice(1));
      }
      if (e.event === "session_info_update") {
        void onThreadsUpdated();
      }
    });

    return () => {
      cancelled = true;
      off();
    };
  }, [spaceSlug, threadId]);

  const rows = useMemo(
    () =>
      foldAcpEvents(events, {
        debugDetachedPermissions,
        backend: activeThread?.backend,
      }),
    [events, debugDetachedPermissions, activeThread?.backend],
  );
  const isPromptActive = useMemo(() => {
    const sorted = [...events].sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      const t = a.at.localeCompare(b.at);
      if (t !== 0) return t;
      return a.id.localeCompare(b.id);
    });
    let active = false;
    for (const e of sorted) {
      if (e.event === "prompt_started") active = true;
      if (e.event === "prompt_completed") active = false;
    }
    return active;
  }, [events]);
  const connectionPhase = useMemo(() => deriveConnectionDot(events), [events]);
  const chrome = useMemo(() => deriveSessionChromeState(events), [events]);

  const dismissPopovers = useCallback(() => {
    setUsageHoverOpen(false);
    setModeMenuOpen(false);
    setNewChatMenuOpen(false);
    window.dispatchEvent(new Event(ACP_CHAT_DISMISS_POPOVERS_EVENT));
  }, []);

  const filteredCommands = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return chrome.availableCommands;
    return chrome.availableCommands.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [chrome.availableCommands, commandQuery]);

  const modeMenuOptions = useMemo(() => {
    if (chrome.modeOptions.length > 0) return chrome.modeOptions;
    return (["plan", "debug", "ask", "agent"] as const).map((modeId) => ({
      modeId,
      label: modeChipTheme(modeId).label,
    }));
  }, [chrome.modeOptions]);

  const extraConfigControls = useMemo(
    () =>
      chrome.configControls.filter(
        (control) =>
          control.category !== "mode" &&
          control.category !== "model" &&
          !control.name.toLowerCase().includes("mode") &&
          !control.name.toLowerCase().includes("model"),
      ),
    [chrome.configControls],
  );

  const listFooter = useMemo(() => {
    if (pendingUserMessages.length === 0) return null;
    return (
      <div className="space-y-4 pt-4">
        {pendingUserMessages.map((pending) => (
          <div key={pending.id} className="w-full">
            <div className={`${chatInputShell} max-w-none opacity-90`}>
              <div className={chatUserInner}>
                <MarkdownMessage text={pending.text} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [pendingUserMessages]);

  useEffect(() => {
    if (!historyOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = historyRef.current;
      if (el && !el.contains(ev.target as Node)) setHistoryOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [historyOpen]);

  useEffect(() => {
    if (!newChatMenuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = newChatRef.current;
      if (el && !el.contains(ev.target as Node)) setNewChatMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [newChatMenuOpen]);

  useEffect(() => {
    if (!plusOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = plusRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setPlusOpen(false);
        setPlusPanel("root");
        setCommandQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [plusOpen]);

  useEffect(() => {
    if (!usageHoverOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = usageRef.current;
      if (el && !el.contains(ev.target as Node)) setUsageHoverOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [usageHoverOpen]);

  useEffect(() => {
    if (!modeMenuOpen) return;
    const onDoc = (ev: MouseEvent) => {
      const el = modeMenuRef.current;
      if (el && !el.contains(ev.target as Node)) setModeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modeMenuOpen]);

  const handleStartAcp = useCallback(async () => {
    if (!threadId) return;
    setIsStarting(true);
    setNotice(null);
    try {
      await window.basis.acp.startSession({ spaceSlug, threadId });
      await onThreadsUpdated();
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to start ACP");
    } finally {
      setIsStarting(false);
    }
  }, [spaceSlug, threadId, onThreadsUpdated]);

  const handleSend = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!threadId || !trimmedPrompt || isPromptActive) return;
    const pendingId = crypto.randomUUID();
    setPrompt("");
    setPendingUserMessages((prev) => [
      ...prev,
      { id: pendingId, text: trimmedPrompt },
    ]);
    setIsSending(true);
    setNotice(null);
    try {
      await window.basis.acp.sendPrompt({
        spaceSlug,
        threadId,
        prompt: trimmedPrompt,
      });
      await onThreadsUpdated();
    } catch (err) {
      setPendingUserMessages((prev) =>
        prev.filter((msg) => msg.id !== pendingId),
      );
      setPrompt(trimmedPrompt);
      setNotice(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setIsSending(false);
    }
  }, [spaceSlug, threadId, prompt, onThreadsUpdated, isPromptActive]);

  const handleCancelPrompt = useCallback(async () => {
    if (!threadId || !isPromptActive) return;
    if (typeof window.basis.acp.cancelPrompt !== "function") {
      setNotice("Stop is unavailable until the app reloads. Please restart Basis.");
      return;
    }
    setIsCancelling(true);
    setNotice(null);
    try {
      await window.basis.acp.cancelPrompt({ spaceSlug, threadId });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setIsCancelling(false);
    }
  }, [spaceSlug, threadId, isPromptActive]);

  const onPermissionRespond = useCallback(
    async (requestId: string, outcome: AcpPermissionResponseOutcome) => {
      try {
        await window.basis.acp.respondPermission({ requestId, outcome });
        setSettledPermissions((prev) => new Set(prev).add(requestId));
      } catch (err) {
        setNotice(
          err instanceof Error ? err.message : "Permission response failed",
        );
      }
    },
    [],
  );

  const closePlus = useCallback(() => {
    setPlusOpen(false);
    setPlusPanel("root");
    setCommandQuery("");
  }, []);

  const handleSetMode = useCallback(
    async (modeId: string, modeLabel: string) => {
      if (!threadId) return;
      setNotice(null);
      try {
        await window.basis.acp.setSessionMode({ spaceSlug, threadId, modeId });
        closePlus();
        setModeMenuOpen(false);
      } catch (err) {
        const modeControl = chrome.configControls.find(
          (control) =>
            control.type === "select" &&
            (control.category === "mode" ||
              control.name.toLowerCase().includes("mode")),
        );
        if (
          modeControl &&
          modeControl.type === "select" &&
          modeControl.configId
        ) {
          try {
            await window.basis.acp.setSessionConfigOption({
              spaceSlug,
              threadId,
              configId: modeControl.configId,
              value: modeId,
            });
            closePlus();
            setModeMenuOpen(false);
            return;
          } catch {
            // no-op: keep original error below
          }
        }
        setNotice(
          err instanceof Error
            ? err.message
            : `Failed to switch mode (${modeLabel}).`,
        );
      }
    },
    [threadId, spaceSlug, chrome.configControls, closePlus],
  );

  const handleSetModel = useCallback(
    async (args: { modelId: string; label: string; configId?: string }) => {
      if (!threadId) return;
      setNotice(null);
      try {
        await window.basis.acp.setSessionModel({
          spaceSlug,
          threadId,
          modelId: args.modelId,
        });
        closePlus();
      } catch (err) {
        const configId =
          args.configId ??
          chrome.configControls.find(
            (control) =>
              control.type === "select" &&
              (control.category === "model" ||
                control.name.toLowerCase().includes("model")),
          )?.configId ??
          "";
        if (configId) {
          try {
            await window.basis.acp.setSessionConfigOption({
              spaceSlug,
              threadId,
              configId,
              value: args.modelId,
            });
            closePlus();
            return;
          } catch {
            // no-op: keep original error below
          }
        }
        setNotice(
          err instanceof Error
            ? err.message
            : `Failed to switch model (${args.label}).`,
        );
      }
    },
    [threadId, spaceSlug, chrome.configControls, closePlus],
  );

  const handleSetConfigControl = useCallback(
    async (args: {
      configId?: string;
      value?: string;
      booleanValue?: boolean;
    }) => {
      if (!threadId || !args.configId) return;
      setNotice(null);
      try {
        await window.basis.acp.setSessionConfigOption({
          spaceSlug,
          threadId,
          configId: args.configId,
          value: args.value,
          booleanValue: args.booleanValue,
        });
      } catch (err) {
        setNotice(
          err instanceof Error
            ? err.message
            : "Failed to update session option.",
        );
      }
    },
    [threadId, spaceSlug],
  );

  const handleOpenPlan = useCallback(
    (path?: string) => {
      if (!path) {
        setNotice("No plan file path found on this update yet.");
        return;
      }
      dismissPopovers();
      onOpenWorkspaceFile(path);
    },
    [dismissPopovers, onOpenWorkspaceFile],
  );

  const handleOpenSubagent = useCallback(
    async (row: Extract<FoldedChatRow, { type: "subagent" }>) => {
      try {
        await onSpawnSubagentThread({
          title: row.title,
          backend: activeThread?.backend ?? "cursor",
          backendSessionId: row.targetSessionId,
        });
      } catch (err) {
        setNotice(
          err instanceof Error ? err.message : "Failed to open subagent thread",
        );
      }
    },
    [activeThread?.backend, onSpawnSubagentThread],
  );

  const title = activeThread?.title ?? "Chat";
  const modeChip = chrome.currentModeId
    ? modeChipTheme(chrome.currentModeId)
    : null;
  const rawModelLabel = chrome.modelSelect?.currentLabel
    ? chrome.modelSelect.currentLabel
    : "Model";
  const { base: modelLabel } = formatModelName(rawModelLabel, rawModelLabel);
  const contextPct = Math.max(0, Math.min(100, chrome.usage?.pct ?? 0));
  const contextPctDeg = contextPct * 3.6;

  const acpUi = useMemo(
    () =>
      ({
        spaceRoot,
        backend: activeThread?.backend ?? "cursor",
        onOpenFile: (relPath: string) => {
          dismissPopovers();
          onOpenWorkspaceFile(relPath);
        },
        settledPermissions,
        onPermissionRespond,
        dismissPopovers,
      }) satisfies AcpChatUiContextValue,
    [
      dismissPopovers,
      onOpenWorkspaceFile,
      onPermissionRespond,
      settledPermissions,
      spaceRoot,
      activeThread?.backend,
    ],
  );

  return (
    <AcpChatUiProvider value={acpUi}>
      <div className="flex min-h-0 flex-1 flex-col border-r border-neutral-800 bg-canvas">
        <header className="title-bar-drag flex h-8 shrink-0 items-center bg-canvas pl-0.5 pr-0.5">
          {headerControlsLeft}
          <h2
            className={`min-w-0 flex-1 truncate ${typographyLabel} tracking-tight text-neutral-300 ml-1`}
            title={title}
          >
            {title}
          </h2>
          <div className="title-bar-no-drag flex h-full items-center">
            <div className="mr-0.5 flex items-center">
              <ConnectionDotIndicator phase={connectionPhase} />
            </div>
            <div
              ref={usageRef}
              className="relative mr-1 flex h-5 shrink-0 items-center"
              onMouseEnter={() => setUsageHoverOpen(true)}
              onMouseLeave={() => setUsageHoverOpen(false)}
            >
              <button
                type="button"
                className="inline-flex h-5 items-center gap-1 rounded px-1 text-[10px] text-neutral-500 hover:bg-neutral-900/70 hover:text-neutral-200"
                onClick={() => {
                  setPlusOpen(true);
                  setPlusPanel("models");
                }}
                aria-label="Context usage"
              >
                <span
                  className="relative h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: `conic-gradient(color-mix(in srgb, var(--basis-text-muted) 92%, transparent) ${contextPctDeg}deg, color-mix(in srgb, var(--basis-text-faint) 70%, transparent) ${contextPctDeg}deg)`,
                  }}
                  aria-hidden
                >
                  <span className="absolute inset-[2px] rounded-full bg-canvas" />
                </span>
                <span>{chrome.usage ? `${chrome.usage.pct.toFixed(1)}% context` : "Context"}</span>
              </button>
              {usageHoverOpen ? (
                <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-[var(--basis-border)] bg-[var(--basis-surface)] p-2 shadow-2xl">
                  <div className="text-ui-xs text-[var(--basis-text)]">
                    {modelLabel}
                  </div>
                  {chrome.usage ? (
                    <div className="mt-1.5 text-[10px] text-[var(--basis-text-faint)]">
                      Context: {chrome.usage.used.toLocaleString()} /{" "}
                      {chrome.usage.size.toLocaleString()} tokens (
                      {chrome.usage.pct.toFixed(1)}%)
                    </div>
                  ) : (
                    <div className="mt-1.5 text-[10px] text-[var(--basis-text-faint)]">
                      No usage telemetry yet
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div
              className="relative inline-flex h-5 shrink-0 items-center"
              ref={newChatRef}
            >
              <button
                type="button"
                className={titleBtnIcon}
                title="New chat"
                aria-label="New chat"
                aria-expanded={newChatMenuOpen}
                onClick={() => setNewChatMenuOpen((open) => !open)}
              >
                <IconPlus />
              </button>
              {newChatMenuOpen ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-ui-sm text-neutral-200 transition-colors hover:bg-neutral-900/70"
                    onClick={() => {
                      void onNewChat({ backend: "cursor" });
                      setNewChatMenuOpen(false);
                    }}
                  >
                    <span>Cursor</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-ui-sm text-neutral-200 transition-colors hover:bg-neutral-900/70"
                    onClick={() => {
                      void onNewChat({ backend: "opencode" });
                      setNewChatMenuOpen(false);
                    }}
                  >
                    <span>OpenCode</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={titleBtnIcon}
              title="Start ACP session"
              aria-label="Start ACP session"
              disabled={!threadId || isStarting}
              onClick={() => void handleStartAcp()}
            >
              <IconBolt />
            </button>
            <div
              className="relative inline-flex h-5 shrink-0 items-center"
              ref={historyRef}
            >
              <button
                type="button"
                className={titleBtnIcon}
                title="Chat history"
                aria-expanded={historyOpen}
                aria-label="Chat history"
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <IconHistory />
              </button>
              {historyOpen ? (
                <div
                  className="thin-scrollbar absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 py-1 shadow-lg"
                  role="listbox"
                >
                  {threads.length === 0 ? (
                    <p
                      className={`px-3 py-2 ${typographyCaption} text-neutral-500`}
                    >
                      No threads yet
                    </p>
                  ) : (
                    threads.map((t) => (
                      <button
                        key={t.threadId}
                        type="button"
                        role="option"
                        aria-selected={t.threadId === activeThreadId}
                        className={
                          t.threadId === activeThreadId
                            ? "flex w-full flex-col gap-0.5 bg-neutral-900 px-3 py-2 text-left"
                            : "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-neutral-900/70"
                        }
                        onClick={() => {
                          onSelectThread(t.threadId);
                          setHistoryOpen(false);
                        }}
                      >
                        <span
                          className={`truncate ${typographyBody} text-neutral-200`}
                        >
                          {t.title}
                        </span>
                        <span className="truncate text-ui-xs text-neutral-500 flex items-center gap-2">
                          <span>{t.status}</span>
                          <span className="rounded border border-neutral-700/80 px-1.5 py-[1px] text-[10px] uppercase tracking-wide text-neutral-400">
                            {backendLabel(t.backend)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          {headerControlsRight}
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 pt-1">
            {!threadId ? (
              <div className="flex h-full items-center justify-center px-3 pb-28">
                <p className={`text-center ${typographyBody} text-neutral-500`}>
                  Create a new chat and choose Cursor or OpenCode.
                </p>
              </div>
            ) : rows.length === 0 && pendingUserMessages.length === 0 ? (
              <div className="flex h-full items-center justify-center px-3 pb-28">
                <p className={`text-center ${typographyBody} text-neutral-500`}>
                  No messages yet. Start an ACP session and send a prompt.
                </p>
              </div>
            ) : (
              <LegendList<FoldedChatRow>
                className="thin-scrollbar h-full min-h-0 w-full overflow-y-auto"
                style={{ minHeight: 0, scrollbarGutter: "stable" }}
                contentContainerStyle={{
                  /* Clear composer + h-28 gradient + notice line; avoids last lines clipping under the dock */
                  paddingBottom: 125,
                  paddingLeft: CHAT_GUTTER_PX,
                  paddingRight: Math.max(
                    0,
                    CHAT_GUTTER_PX - CHAT_SCROLLBAR_COMPENSATION_PX,
                  ),
                }}
                data={rows}
                keyExtractor={(row) => `${row.type}-${row.id}`}
                estimatedItemSize={90}
                onScroll={() => dismissPopovers()}
                getEstimatedItemSize={(row) => {
                  switch (row.type) {
                    case "tool":
                      return 44;
                    case "tool_explore_group":
                      return 48;
                    case "thinking":
                    case "error":
                      return 40;
                    case "extension":
                    case "plan":
                    case "session_extra":
                      return 52;
                    case "permission":
                      return 88;
                    case "subagent":
                      return 92;
                    default:
                      return 90;
                  }
                }}
                alignItemsAtEnd
                initialScrollAtEnd
                maintainScrollAtEnd
                maintainScrollAtEndThreshold={0.12}
                maintainVisibleContentPosition={{ data: true, size: false }}
                ItemSeparatorComponent={() => (
                  <div className="h-2 shrink-0" aria-hidden />
                )}
                ListFooterComponent={listFooter ?? undefined}
                renderItem={({ item: row }) => (
                  <div className="w-full min-w-0">
                    <ChatRowView
                      row={row}
                      onOpenPlan={handleOpenPlan}
                      onOpenSubagent={handleOpenSubagent}
                    />
                  </div>
                )}
              />
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
            <div
              className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-canvas via-canvas/95 to-transparent"
              aria-hidden
            />
            <div
              className="pointer-events-auto relative pb-2 pt-0"
              style={{ paddingInline: CHAT_GUTTER_PX }}
            >
              {notice ? (
                <p
                  className={`mb-1.5 text-center ${typographyCaption} text-rose-400`}
                >
                  {notice}
                </p>
              ) : null}
              <div className={chatInputShell}>
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Plan, Build, / for commands, @ for context…"
                  rows={1}
                  disabled={!threadId || isSending || isPromptActive}
                  className={chatComposerTextarea}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-0.5 px-0.5 pb-0.5">
                  <div className="flex h-5 min-w-0 items-center gap-0.5">
                    <div className="relative" ref={plusRef}>
                      <button
                        type="button"
                        className={btnIcon}
                        aria-label="Add"
                        aria-expanded={plusOpen}
                        onClick={() => {
                          setPlusOpen((o) => !o);
                          setPlusPanel("root");
                          setCommandQuery("");
                        }}
                      >
                        <IconPlus />
                      </button>
                      {plusOpen ? (
                        <div className="absolute bottom-full left-0 z-40 mb-2 w-72 overflow-hidden rounded-xl border border-[var(--basis-border)] bg-[var(--basis-surface)] shadow-2xl py-1">
                        {plusPanel === "root" ? (
                          <div className="flex flex-col">
                            <div className="px-2 py-1 mb-1">
                              <input
                                className="w-full bg-transparent outline-none text-ui-xs text-[var(--basis-text)] placeholder-[var(--basis-text-faint)]"
                                placeholder="Add agents, context, tools..."
                                autoFocus
                              />
                            </div>
                            <div className="space-y-px px-1.5">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] transition-colors"
                                onClick={() => setNotice("Image UI not wired yet.")}
                              >
                                <ImageIcon className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                                <span>Image</span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] transition-colors"
                                onClick={() => setPlusPanel("models")}
                              >
                                <span className="flex items-center gap-2">
                                  <Box className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                                  <span>Models</span>
                                </span>
                                <IconChevronRight className="h-3 w-3 text-[var(--basis-text-faint)]" />
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] transition-colors"
                                onClick={() => setPlusPanel("skills")}
                              >
                                <span className="flex items-center gap-2">
                                  <BookOpen className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                                  <span>Skills</span>
                                </span>
                                <IconChevronRight className="h-3 w-3 text-[var(--basis-text-faint)]" />
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] transition-colors"
                                onClick={() => setPlusPanel("options")}
                              >
                                <span className="flex items-center gap-2">
                                  <Plug className="h-3.5 w-3.5 text-[var(--basis-text-muted)]" />
                                  <span>MCP Servers</span>
                                </span>
                                <IconChevronRight className="h-3 w-3 text-[var(--basis-text-faint)]" />
                              </button>
                            </div>
                          </div>
                        ) : plusPanel === "skills" ? (
                          <div className="flex max-h-[20rem] flex-col">
                            <div className="mb-1 flex items-center gap-1.5 border-b border-[var(--basis-border)] px-2 py-1">
                              <button
                                type="button"
                                className="text-[var(--basis-text-muted)] transition-colors hover:text-[var(--basis-text)]"
                                onClick={() => {
                                  setPlusPanel("root");
                                  setCommandQuery("");
                                }}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <input
                                value={commandQuery}
                                onChange={(e) =>
                                  setCommandQuery(e.target.value)
                                }
                                placeholder="Search commands…"
                                className="w-full bg-transparent text-ui-xs text-[var(--basis-text)] outline-none placeholder-[var(--basis-text-faint)]"
                                autoFocus
                              />
                            </div>
                            <div className="thin-scrollbar flex-1 space-y-px overflow-x-hidden overflow-y-auto p-1.5 pt-0">
                              {filteredCommands.length === 0 ? (
                                <p className="px-2 py-1 text-ui-xs text-[var(--basis-text-faint)]">
                                  No commands yet
                                </p>
                              ) : (
                                filteredCommands.map((c) => (
                                  <button
                                    key={c.name}
                                    type="button"
                                    className="flex w-full flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--basis-surface-hover)]"
                                    onClick={() => {
                                      setPrompt((prev) =>
                                        prev.trim()
                                          ? `${prev} ${c.name}`
                                          : c.name,
                                      );
                                      closePlus();
                                      promptRef.current?.focus();
                                    }}
                                  >
                                    <div className="text-ui-xs font-medium text-[var(--basis-text)]">
                                      {c.name}
                                    </div>
                                    <div className="w-full truncate text-[10px] text-[var(--basis-text-faint)]">
                                      {c.description}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : plusPanel === "models" ? (
                          <div className="flex max-h-[20rem] flex-col">
                            <div className="mb-1 flex items-center gap-1.5 border-b border-[var(--basis-border)] px-2 py-1">
                              <button
                                type="button"
                                className="text-[var(--basis-text-muted)] transition-colors hover:text-[var(--basis-text)]"
                                onClick={() => setPlusPanel("root")}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <input
                                className="w-full bg-transparent text-ui-xs text-[var(--basis-text)] outline-none placeholder-[var(--basis-text-faint)]"
                                placeholder="Search models"
                                autoFocus
                              />
                            </div>
                            <div className="thin-scrollbar flex-1 space-y-px overflow-x-hidden overflow-y-auto p-1.5 pt-0">
                              {(chrome.modelSelect?.options.length
                                ? chrome.modelSelect.options
                                : []
                              ).map((opt) => {
                                const { base, options } = formatModelName(opt.valueId, opt.label);
                                return (
                                  <button
                                    key={opt.valueId}
                                    type="button"
                                    className="group flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--basis-surface-hover)]"
                                    onClick={() => {
                                      void handleSetModel({
                                        modelId: opt.valueId,
                                        label: opt.label,
                                        configId: opt.configId,
                                      });
                                    }}
                                  >
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-ui-xs text-[var(--basis-text)]">
                                      <span className="truncate">{base}</span>
                                      {options.thinking === "true" ? <Brain className="h-3 w-3 text-[var(--basis-text-muted)]" /> : null}
                                      {options.fast === "true" ? <span className="text-[10px] text-[var(--basis-text-faint)]">Fast</span> : null}
                                      {options.effort ? <span className="text-[10px] capitalize text-[var(--basis-text-faint)]">{options.effort}</span> : null}
                                      {options.reasoning ? <span className="text-[10px] capitalize text-[var(--basis-text-faint)]">{options.reasoning}</span> : null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1 text-[10px] text-[var(--basis-text-faint)] opacity-0 transition-opacity group-hover:opacity-100">
                                      <span>Edit</span>
                                      <IconChevronRight className="h-3 w-3" />
                                    </div>
                                  </button>
                                );
                              })}
                              {!chrome.modelSelect?.options.length ? (
                                <p className="px-2 py-1 text-ui-xs text-[var(--basis-text-faint)]">
                                  No model list yet
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col max-h-[20rem]">
                            <div className="mb-1 flex items-center gap-1.5 border-b border-[var(--basis-border)] px-2 py-1">
                              <button
                                type="button"
                                className="text-[var(--basis-text-muted)] transition-colors hover:text-[var(--basis-text)]"
                                onClick={() => setPlusPanel("root")}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-ui-xs text-[var(--basis-text)]">
                                Options
                              </span>
                            </div>
                            <div className="thin-scrollbar flex-1 space-y-px overflow-y-auto p-1.5 pt-0">
                                {extraConfigControls.length === 0 ? (
                                  <p className="px-2 py-1 text-ui-xs text-[var(--basis-text-faint)]">
                                    No extra options yet
                                  </p>
                                ) : (
                                  extraConfigControls.map((control) => (
                                    <div
                                      key={control.configId ?? control.name}
                                      className="rounded-md border border-[var(--basis-border)] px-1.5 py-1.5"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px] text-[var(--basis-text)]">
                                          {control.name}
                                        </div>
                                        <div className="text-[9px] uppercase text-[var(--basis-text-faint)]">
                                          {control.category ?? control.type}
                                        </div>
                                      </div>
                                      {control.type === "boolean" ? (
                                        <button
                                          type="button"
                                          className="mt-1 rounded border border-[var(--basis-border)] bg-[var(--basis-surface-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)]"
                                          onClick={() =>
                                            void handleSetConfigControl({
                                              configId: control.configId,
                                              booleanValue:
                                                !control.currentValue,
                                            })
                                          }
                                          disabled={!control.configId}
                                        >
                                          {control.currentValue ? "On" : "Off"}
                                        </button>
                                      ) : (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {control.options.map((opt) => (
                                            <button
                                              key={opt.valueId}
                                              type="button"
                                              className={
                                                opt.valueId ===
                                                control.currentValue
                                                  ? "rounded border border-[var(--basis-border)] bg-[var(--basis-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--basis-text-strong)]"
                                                  : "rounded border border-[var(--basis-border)] bg-[var(--basis-surface-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--basis-text-muted)] hover:bg-[var(--basis-surface-hover)]"
                                              }
                                              onClick={() =>
                                                void handleSetConfigControl({
                                                  configId: control.configId,
                                                  value: opt.valueId,
                                                })
                                              }
                                              disabled={!control.configId}
                                            >
                                              {opt.label}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {modeChip ? (
                      <div className="relative" ref={modeMenuRef}>
                        <button
                          type="button"
                          className={`inline-flex h-5 items-center gap-1 rounded-md px-1 leading-none ${modeChip.className} hover:opacity-95`}
                          aria-expanded={modeMenuOpen}
                          aria-label="Select mode"
                          onClick={() => setModeMenuOpen((v) => !v)}
                        >
                          {getModeIcon(
                            chrome.currentModeId!,
                            "h-3 w-3 opacity-80",
                          )}
                          <span className="font-medium text-[11px] leading-tight">
                            {modeChip.label}
                          </span>
                          <IconChevronDown className="h-3 w-3 opacity-70" />
                        </button>
                        {modeMenuOpen ? (
                          <div className="absolute bottom-full left-0 z-40 mb-2 w-40 overflow-hidden rounded-xl border border-[var(--basis-border)] bg-[var(--basis-surface)] shadow-2xl py-1">
                            <div className="space-y-px px-1.5">
                              {modeMenuOptions.map((m) => (
                                <button
                                  key={m.modeId}
                                  type="button"
                                  className={
                                    m.modeId === chrome.currentModeId
                                      ? "flex w-full items-center gap-2 rounded-md bg-[var(--basis-surface-hover)] px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)]"
                                      : "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)]"
                                  }
                                  onClick={() =>
                                    void handleSetMode(m.modeId, m.label)
                                  }
                                >
                                  {getModeIcon(
                                    m.modeId,
                                    "h-3.5 w-3.5 text-[var(--basis-text-muted)]",
                                  )}
                                  <span>{m.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="flex h-5 min-w-0 items-center gap-1 rounded-md px-1 text-[11px] leading-none text-[var(--basis-text-muted)] hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)]"
                      onClick={() => {
                        setPlusOpen(true);
                        setPlusPanel("models");
                      }}
                    >
                      <span className="truncate">{modelLabel}</span>
                      <IconChevronDown className="h-3 w-3 shrink-0 text-[var(--basis-text-faint)]" />
                    </button>
                  </div>

                  <button
                    type="button"
                    className={btnSend}
                    aria-label={isPromptActive ? "Stop" : "Send"}
                    disabled={
                      isPromptActive
                        ? !threadId || isCancelling
                        : !threadId || !prompt.trim() || isSending
                    }
                    onClick={() =>
                      void (isPromptActive ? handleCancelPrompt() : handleSend())
                    }
                  >
                    {isPromptActive ? (
                      <IconStop className="h-3 w-3" />
                    ) : (
                      <IconSend className="h-3 w-3 -translate-y-px" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AcpChatUiProvider>
  );
}

