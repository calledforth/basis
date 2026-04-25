import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TerminalSquare } from "lucide-react";
import type {
  AcpPermissionResponseOutcome,
  AcpPermissionRequestEventData,
} from "../../types";
import type { FoldedChatRow, FoldedToolRow } from "../../lib/foldAcpEvents";
import { presentToolRow } from "../../lib/acpToolPresenter";
import {
  useAcpChatUi,
  ACP_CHAT_DISMISS_POPOVERS_EVENT,
} from "../acpChatUiContext";
import {
  chatInputShell,
  chatStreamInner,
  chatUserInner,
} from "../chatComposerStyles";
import { typographyMonoCaption } from "../../lib/typography";
import {
  IconBolt,
  IconChevronRight,
  IconFile,
  IconStop,
  MarkdownMessage,
  extractPlanOpenPath,
  planSummary,
} from "./uiPrimitives";

/** Borderless “activity stream” rows (tools / meta) — muted verb, base detail */
const activityRow = "w-full max-w-none px-2 py-px text-ui-base leading-snug";
const activityMuted = "text-[#a8a8a8]";
const activityMono = `${typographyMonoCaption} text-[#a8a8a8]`;
const activityDetailsSummary =
  "flex cursor-pointer list-none items-start gap-1.5 text-ui-base leading-snug [&::-webkit-details-marker]:hidden";

function safeJson(obj: unknown, max = 6000): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
  } catch {
    return String(obj);
  }
}

function PermissionInline({
  data,
  settled,
  onRespond,
  embedded,
}: {
  data: AcpPermissionRequestEventData;
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
    <ToolResultLinks links={model.resultLinks ?? []} />
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

export function ChatRowView({
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
