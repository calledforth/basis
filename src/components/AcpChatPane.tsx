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
import { TerminalSquare, Workflow, EyeOff, MessageCircleQuestion, Image as ImageIcon, Box, BookOpen, Plug, Brain, ChevronLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  type FoldedToolRow,
} from "../lib/foldAcpEvents";
import {
  deriveSessionChromeState,
  modeChipTheme,
} from "../lib/acpSessionChrome";
import { presentToolRow } from "../lib/acpToolPresenter";
import { toVaultRelPath } from "../lib/acpPath";
import {
  AcpChatUiProvider,
  useAcpChatUi,
  type AcpChatUiContextValue,
  ACP_CHAT_DISMISS_POPOVERS_EVENT,
} from "./acpChatUiContext";
import {
  btnSend,
  chatComposerTextarea,
  chatStreamInner,
  chatUserInner,
  chatInputShell,
  COMPOSER_TEXTAREA_MAX_PX,
  COMPOSER_TEXTAREA_MIN_PX,
} from "./chatComposerStyles";
import {
  typographyBody,
  typographyCaption,
  typographyLabel,
  typographyMonoCaption,
} from "../lib/typography";

const iconStroke = {
  strokeWidth: 1,
  vectorEffect: "non-scaling-stroke" as const,
};

const btnIcon =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-900/70 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-600 disabled:pointer-events-none disabled:opacity-40";

/**
 * Horizontal chat gutter shared by list and composer.
 * List right padding is scrollbar-compensated so user bubbles and composer match visual width.
 */
const CHAT_GUTTER_PX = 15;
const CHAT_SCROLLBAR_COMPENSATION_PX = 9;

function joinFs(root: string, rel: string): string {
  const a = root.replace(/[\\/]+$/, "");
  const b = rel.replace(/^[\\/]+/, "");
  const sep = root.includes("\\") ? "\\" : "/";
  return `${a}${sep}${b}`;
}

/** Borderless “activity stream” rows (tools / meta) — muted verb, base detail */
const activityRow = "w-full max-w-none px-2 py-px text-ui-base leading-snug";
const activityMuted = "text-[#a8a8a8]";
const activityBase = "text-[#d4d4d4]";
const activityMono = `${typographyMonoCaption} text-[#a8a8a8]`;
const activityDetailsSummary =
  "flex cursor-pointer list-none items-start gap-1.5 text-ui-base leading-snug [&::-webkit-details-marker]:hidden";

type PendingUserMessage = {
  id: string;
  text: string;
};

function safeJson(obj: unknown, max = 6000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
  } catch {
    return String(obj);
  }
}

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 2.5v9M2.5 7h9"
        stroke="currentColor"
        strokeLinecap="round"
        {...iconStroke}
      />
    </svg>
  );
}

function IconHistory({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 2.25a4.75 4.75 0 1 0 3.4 8.1M7 2.25V1M7 2.25H4.75M7 7l2.25-1.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...iconStroke}
      />
    </svg>
  );
}

function IconBolt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M8 1.25 4.25 8.25h2.9L6.5 12.75 10.25 6H7.35L8 1.25Z"
        stroke="currentColor"
        strokeLinejoin="round"
        {...iconStroke}
      />
    </svg>
  );
}

function IconSend({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M8 13V3M3.5 8 8 3l4.5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...iconStroke}
      />
    </svg>
  );
}

function IconChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M2.5 4.25L6 7.75L9.5 4.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ConnectionDotIndicator({
  phase,
}: {
  phase: ReturnType<typeof deriveConnectionDot>;
}) {
  const color =
    phase === "authenticated"
      ? "bg-emerald-400"
      : phase === "initialized"
        ? "bg-sky-400"
        : phase === "spawned"
          ? "bg-amber-400"
          : phase === "error"
            ? "bg-rose-500"
            : "bg-neutral-600";
  const label =
    phase === "authenticated"
      ? "Connected"
      : phase === "initialized"
        ? "Initialized"
        : phase === "spawned"
          ? "Process started"
          : phase === "error"
            ? "Error"
            : "Idle";
  return (
    <span
      title={label}
      className="inline-flex h-4 w-4 items-center justify-center"
      aria-label={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

function backendLabel(backend: ThreadBackend | undefined): string {
  return backend === "opencode" ? "OpenCode" : "Cursor";
}

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="chat-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
            >
              {children}
            </a>
          ),
          ul: ({ children, className }) => (
            <ul className={className}>{children}</ul>
          ),
          ol: ({ children, className }) => (
            <ol className={className}>{children}</ol>
          ),
          li: ({ children, className }) => (
            <li className={className}>{children}</li>
          ),
          strong: ({ children }) => <strong>{children}</strong>,
          em: ({ children }) => <em>{children}</em>,
          del: ({ children }) => <del>{children}</del>,
          h1: ({ children }) => <h1>{children}</h1>,
          h2: ({ children }) => <h2>{children}</h2>,
          h3: ({ children }) => <h3>{children}</h3>,
          h4: ({ children }) => <h4>{children}</h4>,
          h5: ({ children }) => <h5>{children}</h5>,
          h6: ({ children }) => <h6>{children}</h6>,
          blockquote: ({ children }) => <blockquote>{children}</blockquote>,
          hr: () => <hr />,
          img: ({ src, alt, title }) => (
            <img
              src={src ?? undefined}
              alt={alt ?? ""}
              title={title ?? undefined}
              loading="lazy"
              decoding="async"
            />
          ),
          table: ({ children }) => (
            <div className="chat-markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          code: ({ children, className }) => {
            if (className) {
              return <code className={className}>{children}</code>;
            }
            return <code>{children}</code>;
          },
          pre: ({ children }) => <pre>{children}</pre>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function IconFile({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M8.25 1.75H4.25c-.69 0-1.25.56-1.25 1.25v7c0 .69.56 1.25 1.25 1.25h5.5c.69 0 1.25-.56 1.25-1.25V4.75L8.25 1.75Z"
        stroke="currentColor"
        strokeLinejoin="round"
        {...iconStroke}
      />
      <path
        d="M8.25 1.75V4.5h2.75"
        stroke="currentColor"
        strokeLinejoin="round"
        {...iconStroke}
      />
    </svg>
  );
}

function IconStop({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <rect
        x="3.25"
        y="3.25"
        width="7.5"
        height="7.5"
        rx="1.5"
        stroke="currentColor"
        {...iconStroke}
      />
    </svg>
  );
}

function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
    >
      <path
        d="M4.25 2.25L7.75 6 4.25 9.75"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PermissionInline({
  data,
  settled,
  onRespond,
  embedded,
}: {
  data: import("../types").AcpPermissionRequestEventData;
  settled: boolean;
  onRespond: (outcome: AcpPermissionResponseOutcome) => Promise<void>;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "bg-[#1a1a1a] p-2.5"
          : "mt-2 rounded-md border border-[#363636] bg-[#1a1a1a] p-2"
      }
    >
      <div className="mb-1.5 text-ui-sm font-medium uppercase tracking-wide text-[#8f8f8f]">
        Permission
      </div>
      <div className="flex flex-wrap gap-2">
        {data.options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            disabled={settled}
            className="rounded-md border border-[#363636] bg-[#212121] px-2.5 py-1 text-ui-sm font-medium text-[#d0d0d0] hover:bg-[#262626] disabled:opacity-40"
            onClick={() =>
              onRespond({ outcome: "selected", optionId: opt.optionId })
            }
          >
            {opt.name}
          </button>
        ))}
        <button
          type="button"
          disabled={settled}
          className="rounded-md px-2.5 py-1 text-ui-sm text-[#8f8f8f] hover:text-[#d0d0d0] disabled:opacity-40"
          onClick={() => onRespond({ outcome: "cancelled" })}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ToolHitsPopover({
  open,
  hits,
  onPick,
}: {
  open: boolean;
  hits: Array<{ relPath?: string; filename: string; dir: string }>;
  onPick: (relPath?: string) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[min(100%,28rem)] rounded-lg border border-neutral-800 bg-neutral-950 p-1 shadow-xl">
      <div className="thin-scrollbar max-h-56 overflow-y-auto">
        {hits.map((h, idx) => (
          <button
            key={`${h.filename}-${idx}`}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-neutral-900"
            onClick={() => onPick(h.relPath)}
          >
            <IconFile className="shrink-0 text-neutral-500" />
            <span className="min-w-0 flex-1 truncate text-neutral-200">
              {h.filename}
            </span>
            <span className="shrink-0 truncate text-ui-xs text-neutral-600">
              {h.dir}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolResultLinks({ links }: { links: string[] }) {
  if (!links.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2 pl-0.5">
      {links.map((link) => (
        <a
          key={link}
          href={link}
          target="_blank"
          rel="noreferrer noopener"
          className="max-w-full truncate text-ui-xs text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300 hover:decoration-neutral-500"
          title={link}
          onClick={(e) => e.stopPropagation()}
        >
          {link}
        </a>
      ))}
    </div>
  );
}

function ToolLine({
  verb,
  detail,
  statusNote,
  detailSlot,
}: {
  verb: string;
  detail: string;
  statusNote?: string;
  detailSlot?: ReactNode;
}) {
  const isRunning =
    statusNote &&
    !/(done|complete|completed|success|failed|error|cancelled)/.test(
      statusNote.toLowerCase(),
    );
  return (
    <span className="min-w-0">
      {isRunning ? (
        <span
          className="inline"
          style={{
            background:
              "linear-gradient(90deg, #4a4a4a 25%, #888 50%, #4a4a4a 75%)",
            backgroundSize: "200% 100%",
            backgroundClip: "text",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            animation: "shimmer 1.6s infinite linear",
          }}
        >
          {verb}
          {detail ? ` ${detail}` : ""}
        </span>
      ) : (
        <>
          <span className="text-neutral-400">{verb}</span>
          {detail ? (
            <>
              {" "}
              {detailSlot ?? <span className="text-neutral-500">{detail}</span>}
            </>
          ) : null}
        </>
      )}
    </span>
  );
}

function SingleToolRow({ row }: { row: FoldedToolRow }) {
  const ui = useAcpChatUi();
  const model = useMemo(
    () => presentToolRow({ row, spaceRoot: ui.spaceRoot }),
    [row, ui.spaceRoot],
  );

  const [hoverOpen, setHoverOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onDismiss = () => setHoverOpen(false);
    window.addEventListener(ACP_CHAT_DISMISS_POPOVERS_EVENT, onDismiss);
    return () =>
      window.removeEventListener(ACP_CHAT_DISMISS_POPOVERS_EVENT, onDismiss);
  }, []);

  const permission = row.permission;
  const permissionSettled = permission
    ? ui.settledPermissions.has(permission.requestId)
    : true;

  const line = (
    <ToolLine
      verb={model.verb}
      detail={model.detail}
      statusNote={model.statusNote}
      detailSlot={
        model.uiKind === "read" && model.openRelPath ? (
          <button
            type="button"
            className="text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300 hover:decoration-neutral-500"
            onClick={(e) => {
              e.stopPropagation();
              ui.onOpenFile(model.openRelPath!);
            }}
          >
            {model.detail}
          </button>
        ) : model.uiKind === "edit" ? (
          <span className="inline-flex items-center gap-2">
            <button
              type="button"
              className="text-neutral-500 hover:text-neutral-300 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                if (model.diffPath) ui.onOpenFile(model.diffPath);
              }}
            >
              {model.filename || model.diffPath?.split("/").pop() || "File"}
            </button>
            <span className="flex items-center gap-1.5 text-[0.8em] font-mono">
              {(model.diffAdds ?? 0) > 0 ? (
                <span className="text-emerald-400/90">+{model.diffAdds}</span>
              ) : null}
              {(model.diffDels ?? 0) > 0 ? (
                <span className="text-rose-400/90">-{model.diffDels}</span>
              ) : null}
            </span>
          </span>
        ) : undefined
      }
    />
  );
  const links = model.resultLinks?.length ? (
    <ToolResultLinks links={model.resultLinks} />
  ) : null;

  if (model.uiKind === "search") {
    return (
      <div
        className={`relative ${activityRow}`}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
      >
        <div className="min-w-0">{line}</div>
        {links}
        <ToolHitsPopover
          open={hoverOpen && Boolean(model.searchHits?.length)}
          hits={model.searchHits ?? []}
          onPick={(rel) => {
            if (rel) ui.onOpenFile(rel);
          }}
        />
        {permission && !permissionSettled ? (
          <PermissionInline
            data={permission}
            settled={permissionSettled}
            onRespond={(outcome) =>
              ui.onPermissionRespond(permission.requestId, outcome)
            }
          />
        ) : null}
      </div>
    );
  }

  const expandable =
    model.uiKind === "terminal" ||
    model.uiKind === "web" ||
    model.uiKind === "generic"
      ? Boolean(model.expandedText)
      : model.uiKind === "edit";

  if (expandable) {
    return (
      <div className="my-1 w-full max-w-none overflow-hidden rounded-md border border-[#363636]">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-[#212121] transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {model.uiKind === "terminal" ? (
            <TerminalSquare
              className="h-3.5 w-3.5 shrink-0 text-neutral-500"
              strokeWidth={1.5}
            />
          ) : (
            <IconChevronRight
              className={`h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform ${expanded ? "rotate-90" : ""}`}
            />
          )}
          <div className="min-w-0 flex-1 truncate text-ui-sm">{line}</div>
        </button>
        {links ? <div className="px-2.5 pb-1">{links}</div> : null}
        {expanded ? (
          <div className="border-t border-[#363636]">
            {model.uiKind === "edit" ? (
              <div
                className={`thin-scrollbar max-h-64 overflow-y-auto p-2.5 ${typographyMonoCaption}`}
              >
                {model.diffOldText ? (
                  <div className="mb-2 whitespace-pre-wrap break-words text-rose-300/80">
                    {model.diffOldText}
                  </div>
                ) : null}
                {model.diffNewText ? (
                  <div className="whitespace-pre-wrap break-words text-emerald-300/80">
                    {model.diffNewText}
                  </div>
                ) : null}
              </div>
            ) : (
              <pre
                className={`thin-scrollbar max-h-64 overflow-y-auto whitespace-pre-wrap break-words p-2.5 ${typographyMonoCaption} text-[#a8a8a8]`}
              >
                {model.expandedText}
              </pre>
            )}
          </div>
        ) : null}
        {permission && !permissionSettled ? (
          <div className="border-t border-[#363636]">
            <PermissionInline
              data={permission}
              settled={permissionSettled}
              onRespond={(outcome) =>
                ui.onPermissionRespond(permission.requestId, outcome)
              }
              embedded
            />
          </div>
        ) : null}
      </div>
    );
  }

  // read (non-button detail already handled), plus any fallback
  return (
    <div className={activityRow}>
      <div className="min-w-0">{line}</div>
      {links}
      {permission && !permissionSettled ? (
        <PermissionInline
          data={permission}
          settled={permissionSettled}
          onRespond={(outcome) =>
            ui.onPermissionRespond(permission.requestId, outcome)
          }
        />
      ) : null}
    </div>
  );
}

function ToolExploreGroupRowView({
  row,
}: {
  row: Extract<FoldedChatRow, { type: "tool_explore_group" }>;
}) {
  const label = row.explore === "search" ? "searches" : "files";
  return (
    <details className={`group ${activityRow}`}>
      <summary className={activityDetailsSummary}>
        <span className="text-neutral-400">Explored</span>{" "}
        <span className="text-neutral-500">
          {row.items.length} {label}
        </span>
      </summary>
      <div className="space-y-1 pt-1">
        {row.items.map((item) => (
          <SingleToolRow key={item.toolCallId} row={item} />
        ))}
      </div>
    </details>
  );
}

function SubagentCard({
  row,
  onOpen,
}: {
  row: Extract<FoldedChatRow, { type: "subagent" }>;
  onOpen: () => void | Promise<void>;
}) {
  const busy = row.state === "running";
  return (
    <div className={`${chatInputShell} w-full max-w-none`}>
      <div className="flex items-start gap-2 px-2 py-2">
        <div className="mt-0.5 text-neutral-500">
          {busy ? (
            <IconStop className="text-amber-300/90" />
          ) : (
            <IconBolt className="text-neutral-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-ui-base text-neutral-200">
            {row.title}
          </div>
          {row.subtitle ? (
            <div className="mt-0.5 text-ui-sm text-neutral-500">
              {row.subtitle}
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-ui-xs text-neutral-500">
            {row.model ? <span>Model: {row.model}</span> : null}
            {typeof row.toolCount === "number" ? (
              <span>Tools: {row.toolCount}</span>
            ) : null}
            {row.targetSessionId ? (
              <span className="font-mono">
                Session: {row.targetSessionId.slice(0, 8)}…
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1 text-ui-xs text-neutral-200 hover:bg-neutral-900"
          onClick={() => void onOpen()}
        >
          Open
        </button>
      </div>
    </div>
  );
}

function planSummary(data: unknown): string {
  const d =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const entries = d?.entries;
  if (!Array.isArray(entries) || entries.length === 0) return "Plan updated.";
  const first =
    entries[0] && typeof entries[0] === "object"
      ? (entries[0] as Record<string, unknown>)
      : null;
  const content =
    typeof first?.content === "string" ? first.content.trim() : "";
  return content ? content : "Plan updated.";
}

function extractPlanOpenPath(
  data: unknown,
  spaceRoot: string,
): string | undefined {
  const scanText = (text: string) => {
    const m = text.match(/[`'"]([^`'"]+\.md)[`'"]/);
    if (m?.[1]) {
      const rel = toVaultRelPath({ spaceRoot, rawPath: m[1] });
      return rel ?? m[1].replaceAll("\\", "/");
    }
    return undefined;
  };

  const d =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const entries = d?.entries;
  if (Array.isArray(entries)) {
    for (const e of entries) {
      const r =
        e && typeof e === "object" ? (e as Record<string, unknown>) : null;
      const content = typeof r?.content === "string" ? r.content : "";
      const hit = scanText(content);
      if (hit) return hit;
    }
  }

  const meta = d?._meta;
  const mr =
    meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  const p =
    typeof mr?.planPath === "string"
      ? mr.planPath
      : typeof mr?.path === "string"
        ? mr.path
        : "";
  if (p) {
    const rel = toVaultRelPath({ spaceRoot, rawPath: p });
    return rel ?? p.replaceAll("\\", "/");
  }

  return undefined;
}

function ChatRowView({
  row,
  onOpenPlan,
  onOpenSubagent,
}: {
  row: FoldedChatRow;
  onOpenPlan: (path?: string) => void;
  onOpenSubagent: (
    row: Extract<FoldedChatRow, { type: "subagent" }>,
  ) => void | Promise<void>;
}) {
  const ui = useAcpChatUi();

  switch (row.type) {
    case "user":
      return (
        <div className="w-full text-[#C7C7C7]">
          <div className={`${chatInputShell} max-w-none`}>
            <div className={chatUserInner}>
              <MarkdownMessage text={row.text} />
            </div>
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="w-full text-[#C7C7C7]">
          <div className="w-full max-w-none">
            <div className={chatStreamInner}>
              <MarkdownMessage text={row.text} />
            </div>
          </div>
        </div>
      );
    case "thinking":
      return (
        <details className={`group ${activityRow}`} open={false}>
          <summary className={activityDetailsSummary}>
            <span className="text-neutral-400">Thought</span>
          </summary>
          <div className="thin-scrollbar mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words pl-4 text-ui-sm text-neutral-400">
            {row.text.trim()}
          </div>
        </details>
      );
    case "tool":
      return <SingleToolRow row={row} />;
    case "tool_explore_group":
      return <ToolExploreGroupRowView row={row} />;
    case "permission":
      return (
        <PermissionInline
          data={row.data}
          settled={ui.settledPermissions.has(row.data.requestId)}
          onRespond={(outcome) =>
            ui.onPermissionRespond(row.data.requestId, outcome)
          }
        />
      );
    case "subagent":
      return <SubagentCard row={row} onOpen={() => void onOpenSubagent(row)} />;
    case "extension":
      return (
        <details className={`group ${activityRow}`}>
          <summary className={activityDetailsSummary}>
            <span className="min-w-0 flex-1">
              <span className="text-neutral-400">
                {row.event === "extension_request"
                  ? "Extension request"
                  : "Extension"}
              </span>
              {row.method ? (
                <>
                  {" "}
                  <span className="text-neutral-500">{row.method}</span>
                </>
              ) : null}
            </span>
          </summary>
          <pre
            className={`thin-scrollbar max-h-52 overflow-y-auto whitespace-pre-wrap break-words pl-4 pt-0.5 ${activityMono}`}
          >
            {safeJson(row.data)}
          </pre>
        </details>
      );
    case "plan":
      return (
        <div className={`${activityRow} space-y-2`}>
          <div className="text-ui-base text-neutral-200">
            {planSummary(row.data)}
          </div>
          <button
            type="button"
            className="text-ui-sm text-neutral-400 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-200 hover:decoration-neutral-500"
            onClick={() =>
              onOpenPlan(extractPlanOpenPath(row.data, ui.spaceRoot))
            }
          >
            View plan
          </button>
        </div>
      );
    case "session_extra":
      return (
        <details className={`group ${activityRow}`}>
          <summary className={activityDetailsSummary}>
            <span className="capitalize text-neutral-400">{row.label}</span>
          </summary>
          <pre
            className={`thin-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words pl-4 pt-0.5 ${activityMono}`}
          >
            {safeJson(row.data)}
          </pre>
        </details>
      );
    case "error":
      return (
        <details className={`group ${activityRow}`}>
          <summary className={activityDetailsSummary}>
            <span className="text-ui-base text-rose-400/95">Error</span>
          </summary>
          <pre className="thin-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words pl-4 pt-0.5 font-mono text-ui-xs leading-relaxed text-rose-300/90">
            {safeJson(row.data)}
          </pre>
        </details>
      );
    default:
      return null;
  }
}

function getModeIcon(modeId: string, className?: string) {
  const cn = className || "h-4 w-4 text-neutral-400";
  switch (modeId.toLowerCase()) {
    case "plan": return <Workflow className={cn} />;
    case "debug": return <EyeOff className={cn} />;
    case "ask": return <MessageCircleQuestion className={cn} />;
    default: return <Workflow className={cn} />;
  }
}

function formatModelName(valueId: string, rawLabel: string) {
  const m = valueId.match(/^([^\[]+)(?:\[(.*)\])?$/);
  if (!m) return { base: rawLabel || valueId, options: {} };
  const base = m[1];
  const optionsStr = m[2] || "";
  const options: Record<string, string> = {};
  if (optionsStr) {
    optionsStr.split(",").forEach(part => {
      const [k, v] = part.split("=");
      if (k && v) options[k.trim()] = v.trim();
    });
  }

  let label = rawLabel || base;
  if (label === valueId) {
    if (base.includes("opus-4-7") || base.includes("opus-4.7")) label = "Opus 4.7";
    else if (base.includes("composer-2")) label = "Composer 2";
    else if (base.includes("composer-1.5")) label = "Composer 1.5";
    else if (base.includes("codex")) label = "Codex 5.3";
    else if (base.includes("sonnet")) label = "Sonnet 4.6";
    else if (base.includes("gpt")) label = "GPT-5.4";
    else label = base;
  } else {
    label = label.split("[")[0].trim();
  }

  return { base: label, options };
}

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
    () => foldAcpEvents(events, { debugDetachedPermissions }),
    [events, debugDetachedPermissions],
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

  const acpUi = useMemo(
    () =>
      ({
        spaceRoot,
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
          <div className="title-bar-no-drag flex items-center">
            <div className="mr-1 flex items-center">
              <ConnectionDotIndicator phase={connectionPhase} />
            </div>
            <div className="relative" ref={newChatRef}>
              <button
                type="button"
                className={btnIcon}
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
              className={btnIcon}
              title="Start ACP session"
              aria-label="Start ACP session"
              disabled={!threadId || isStarting}
              onClick={() => void handleStartAcp()}
            >
              <IconBolt />
            </button>
            <div className="relative" ref={historyRef}>
              <button
                type="button"
                className={btnIcon}
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
                style={{ minHeight: 0 }}
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
                maintainVisibleContentPosition={{ data: true, size: true }}
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
                  <div className="flex min-w-0 items-center gap-0.5">
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
                        <div className="absolute bottom-full left-0 z-40 mb-2 w-56 overflow-hidden rounded-xl border border-[#333333] bg-[#1c1c1c] shadow-2xl py-1">
                        {plusPanel === "root" ? (
                          <div className="flex flex-col">
                            <div className="px-2 py-1 mb-1">
                              <input
                                className="w-full bg-transparent outline-none text-ui-xs text-[#E3E3E3] placeholder-[#767676]"
                                placeholder="Add agents, context, tools..."
                                autoFocus
                              />
                            </div>
                            <div className="space-y-px px-1.5">
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3] hover:bg-[#2C2C2C] transition-colors"
                                onClick={() => setNotice("Image UI not wired yet.")}
                              >
                                <ImageIcon className="h-3.5 w-3.5 text-[#A8A8A8]" />
                                <span>Image</span>
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3] hover:bg-[#2C2C2C] transition-colors"
                                onClick={() => setPlusPanel("models")}
                              >
                                <span className="flex items-center gap-2">
                                  <Box className="h-3.5 w-3.5 text-[#A8A8A8]" />
                                  <span>Models</span>
                                </span>
                                <IconChevronRight className="text-[#767676] h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3] hover:bg-[#2C2C2C] transition-colors"
                                onClick={() => setPlusPanel("skills")}
                              >
                                <span className="flex items-center gap-2">
                                  <BookOpen className="h-3.5 w-3.5 text-[#A8A8A8]" />
                                  <span>Skills</span>
                                </span>
                                <IconChevronRight className="text-[#767676] h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3] hover:bg-[#2C2C2C] transition-colors"
                                onClick={() => setPlusPanel("options")}
                              >
                                <span className="flex items-center gap-2">
                                  <Plug className="h-3.5 w-3.5 text-[#A8A8A8]" />
                                  <span>MCP Servers</span>
                                </span>
                                <IconChevronRight className="text-[#767676] h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        ) : plusPanel === "skills" ? (
                          <div className="flex flex-col max-h-[20rem]">
                            <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-[#333333]">
                              <button
                                type="button"
                                className="text-[#A8A8A8] hover:text-[#E3E3E3] transition-colors"
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
                                className="w-full bg-transparent outline-none text-ui-xs text-[#E3E3E3] placeholder-[#767676]"
                                autoFocus
                              />
                            </div>
                            <div className="thin-scrollbar flex-1 overflow-y-auto space-y-px p-1.5 pt-0">
                              {filteredCommands.length === 0 ? (
                                <p className="px-2 py-1 text-ui-xs text-[#767676]">
                                  No commands yet
                                </p>
                              ) : (
                                filteredCommands.map((c) => (
                                  <button
                                    key={c.name}
                                    type="button"
                                    className="w-full flex flex-col gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-[#2C2C2C] transition-colors"
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
                                    <div className="text-ui-xs font-medium text-[#E3E3E3]">
                                      {c.name}
                                    </div>
                                    <div className="text-[10px] text-[#767676] truncate w-full">
                                      {c.description}
                                    </div>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        ) : plusPanel === "models" ? (
                          <div className="flex flex-col max-h-[20rem]">
                            <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-[#333333]">
                              <button
                                type="button"
                                className="text-[#A8A8A8] hover:text-[#E3E3E3] transition-colors"
                                onClick={() => setPlusPanel("root")}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <input
                                className="w-full bg-transparent outline-none text-ui-xs text-[#E3E3E3] placeholder-[#767676]"
                                placeholder="Search models"
                                autoFocus
                              />
                            </div>
                            <div className="thin-scrollbar flex-1 overflow-y-auto space-y-px p-1.5 pt-0">
                              {(chrome.modelSelect?.options.length
                                ? chrome.modelSelect.options
                                : []
                              ).map((opt) => {
                                const { base, options } = formatModelName(opt.valueId, opt.label);
                                return (
                                  <button
                                    key={opt.valueId}
                                    type="button"
                                    className="group flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left hover:bg-[#2C2C2C] transition-colors"
                                    onClick={() => {
                                      void handleSetModel({
                                        modelId: opt.valueId,
                                        label: opt.label,
                                        configId: opt.configId,
                                      });
                                    }}
                                  >
                                    <div className="flex items-center gap-1.5 text-ui-xs text-[#E3E3E3]">
                                      <span>{base}</span>
                                      {options.thinking === "true" ? <Brain className="h-3 w-3 text-[#A8A8A8]" /> : null}
                                      {options.fast === "true" ? <span className="text-[10px] text-[#767676]">Fast</span> : null}
                                      {options.effort ? <span className="text-[10px] text-[#767676] capitalize">{options.effort}</span> : null}
                                      {options.reasoning ? <span className="text-[10px] text-[#767676] capitalize">{options.reasoning}</span> : null}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-[#767676] opacity-0 group-hover:opacity-100 transition-opacity">
                                      <span>Edit</span>
                                      <IconChevronRight className="h-3 w-3" />
                                    </div>
                                  </button>
                                );
                              })}
                              {!chrome.modelSelect?.options.length ? (
                                <p className="px-2 py-1 text-ui-xs text-[#767676]">
                                  No model list yet
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col max-h-[20rem]">
                            <div className="flex items-center gap-1.5 px-2 py-1 mb-1 border-b border-[#333333]">
                              <button
                                type="button"
                                className="text-[#A8A8A8] hover:text-[#E3E3E3] transition-colors"
                                onClick={() => setPlusPanel("root")}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <span className="text-ui-xs text-[#E3E3E3]">
                                Options
                              </span>
                            </div>
                            <div className="thin-scrollbar flex-1 space-y-px overflow-y-auto p-1.5 pt-0">
                                {extraConfigControls.length === 0 ? (
                                  <p className="px-2 py-1 text-ui-xs text-[#767676]">
                                    No extra options yet
                                  </p>
                                ) : (
                                  extraConfigControls.map((control) => (
                                    <div
                                      key={control.configId ?? control.name}
                                      className="rounded-md border border-[#333333] px-1.5 py-1.5"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="text-[11px] text-[#E3E3E3]">
                                          {control.name}
                                        </div>
                                        <div className="text-[9px] text-[#767676] uppercase">
                                          {control.category ?? control.type}
                                        </div>
                                      </div>
                                      {control.type === "boolean" ? (
                                        <button
                                          type="button"
                                          className="mt-1 rounded border border-[#444444] bg-[#222222] px-1.5 py-0.5 text-[10px] text-[#E3E3E3] hover:bg-[#333333]"
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
                                                  ? "rounded border border-[#555555] bg-[#333333] px-1.5 py-0.5 text-[10px] text-[#FFFFFF]"
                                                  : "rounded border border-[#333333] bg-[#222222] px-1.5 py-0.5 text-[10px] text-[#A8A8A8] hover:bg-[#333333]"
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
                          className={`inline-flex items-center gap-1 rounded-md px-1 py-0.5 ${modeChip.className} hover:opacity-95`}
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
                          <div className="absolute bottom-full left-0 z-40 mb-2 w-40 overflow-hidden rounded-xl border border-[#333333] bg-[#1c1c1c] shadow-2xl py-1">
                            <div className="space-y-px px-1.5">
                              {modeMenuOptions.map((m) => (
                                <button
                                  key={m.modeId}
                                  type="button"
                                  className={
                                    m.modeId === chrome.currentModeId
                                      ? "flex w-full items-center gap-2 rounded-md bg-[#2C2C2C] px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3]"
                                      : "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-ui-xs text-[#E3E3E3] hover:bg-[#2C2C2C]"
                                  }
                                  onClick={() =>
                                    void handleSetMode(m.modeId, m.label)
                                  }
                                >
                                  {getModeIcon(
                                    m.modeId,
                                    "h-3.5 w-3.5 text-[#A8A8A8]",
                                  )}
                                  <span>{m.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div
                      ref={usageRef}
                      className="relative flex min-w-0 items-center gap-2"
                      onMouseEnter={() => setUsageHoverOpen(true)}
                      onMouseLeave={() => setUsageHoverOpen(false)}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] text-[#A8A8A8] hover:bg-[#2C2C2C] hover:text-[#E3E3E3]"
                        onClick={() => {
                          setPlusOpen(true);
                          setPlusPanel("models");
                        }}
                      >
                        <span className="truncate">{modelLabel}</span>
                        <IconChevronDown className="h-3 w-3 shrink-0 text-[#767676]" />
                      </button>
                      {chrome.usage ? (
                        <span className="shrink-0 text-[10px] text-[#767676]">
                          {chrome.usage.pct.toFixed(1)}% ctx
                        </span>
                      ) : null}

                      {usageHoverOpen ? (
                        <div className="absolute bottom-full right-0 z-40 mb-2 w-56 rounded-xl border border-[#333333] bg-[#1c1c1c] p-2 shadow-2xl">
                          <div className="text-ui-xs text-[#E3E3E3]">
                            {modelLabel}
                          </div>
                          {chrome.usage ? (
                            <div className="mt-1.5 text-[10px] text-[#767676]">
                              Context: {chrome.usage.used.toLocaleString()} /{" "}
                              {chrome.usage.size.toLocaleString()} tokens (
                              {chrome.usage.pct.toFixed(1)}%)
                            </div>
                          ) : (
                            <div className="mt-1.5 text-[10px] text-[#767676]">
                              No usage telemetry yet
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
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
