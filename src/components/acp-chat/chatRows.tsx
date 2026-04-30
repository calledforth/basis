import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CircleDashed,
  ListTodo,
  Loader2,
  TerminalSquare,
} from "lucide-react";
import type {
  AcpPermissionResponseOutcome,
  AcpPermissionRequestEventData,
} from "../../types";
import type { FoldedChatRow, FoldedToolRow } from "../../lib/foldAcpEvents";
import { presentToolRow, type ToolPresenterModel } from "../../lib/acpToolPresenter";
import {
  useAcpChatUi,
  ACP_CHAT_DISMISS_POPOVERS_EVENT,
} from "../acpChatUiContext";
import {
  chatInputShell,
  chatStreamInner,
  chatUserInner,
} from "../chatComposerStyles";
import { typographyBodySm, typographyMonoCaption } from "../../lib/typography";
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
const activityRowBare = "w-full max-w-none py-px text-ui-base leading-snug";
const activityRow = `${activityRowBare} px-2`;
const activityMuted = "text-[var(--basis-text-muted)]";
const activityMono = `${typographyMonoCaption} text-[var(--basis-text-muted)]`;
const activityDetailsSummary =
  "flex cursor-pointer list-none items-start gap-1.5 text-ui-base leading-snug [&::-webkit-details-marker]:hidden";

function safeJson(obj: unknown, max?: number): string {
  try {
    const s = JSON.stringify(obj, null, 2);
    if (typeof max !== "number" || !Number.isFinite(max) || max <= 0) return s;
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
          ? "bg-[var(--basis-surface)] p-2.5"
          : "mt-2 rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface)] p-2"
      }
    >
      <div className="mb-1.5 text-ui-sm font-medium uppercase tracking-wide text-[var(--basis-text-muted)]">
        Permission
      </div>
      <div className="flex flex-wrap gap-2">
        {data.options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            disabled={settled}
            className="rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface-elevated)] px-2.5 py-1 text-ui-sm font-medium text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] disabled:opacity-40"
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
          className="rounded-md px-2.5 py-1 text-ui-sm text-[var(--basis-text-muted)] hover:text-[var(--basis-text)] disabled:opacity-40"
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
    <div className="absolute left-0 top-full z-30 mt-1 w-[min(100%,28rem)] rounded-lg border border-[var(--basis-border)] bg-[var(--basis-surface)] p-1 shadow-xl">
      <div className="thin-scrollbar max-h-56 overflow-y-auto">
        {hits.map((h, idx) => (
          <button
            key={`${h.filename}-${idx}`}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-ui-sm hover:bg-[var(--basis-surface-hover)]"
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
              "linear-gradient(90deg, color-mix(in srgb, var(--basis-text-faint) 65%, transparent) 25%, color-mix(in srgb, var(--basis-text-muted) 92%, transparent) 50%, color-mix(in srgb, var(--basis-text-faint) 65%, transparent) 75%)",
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
          {detail || detailSlot ? (
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

function TodoToolCard({
  row,
  model,
}: {
  row: FoldedToolRow;
  model: ToolPresenterModel;
}) {
  if (model.uiKind !== "todo") return null;
  const items = model.todoItems ?? [];
  return (
    <div className="my-3 w-full max-w-none rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface)]/15">
      <div className="flex items-center gap-1.5 px-3 py-1.5">
        <ListTodo className="h-3 w-3 shrink-0 text-[var(--basis-text-muted)]" />
        <span className="text-ui-sm leading-snug text-[var(--basis-text-muted)]">To-dos</span>
        <span className="text-ui-sm leading-snug text-[var(--basis-text-faint)]">{items.length}</span>
      </div>
      <div className="space-y-px px-3 pb-1.5">
        {items.map((todo, idx) => {
          const status = todo.status.toLowerCase();
          const done = status === "completed";
          const inProgress = status === "in_progress";
          return (
            <div
              key={`${todo.content}-${idx}`}
              className="flex items-start gap-1.5 py-px"
            >
              {done ? (
                <CheckCircle2 className="mt-[2px] h-3 w-3 shrink-0 text-emerald-400/90" />
              ) : inProgress ? (
                <Loader2 className="mt-[2px] h-3 w-3 shrink-0 animate-spin text-neutral-400" />
              ) : (
                <CircleDashed className="mt-[2px] h-3 w-3 shrink-0 text-[var(--basis-text-faint)]" />
              )}
              <span
                className={
                  done
                    ? "min-w-0 flex-1 text-ui-sm leading-snug text-[var(--basis-text-faint)] line-through"
                    : inProgress
                      ? "min-w-0 flex-1 text-ui-sm leading-snug text-[var(--basis-text)]"
                      : "min-w-0 flex-1 text-ui-sm leading-snug text-[var(--basis-text-muted)]"
                }
              >
                {todo.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SingleToolRow({ row }: { row: FoldedToolRow }) {
  const ui = useAcpChatUi();
  const model = useMemo(
    () => presentToolRow({ row, spaceRoot: ui.spaceRoot, backend: ui.backend }),
    [row, ui.spaceRoot, ui.backend],
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
            className="text-neutral-500 hover:text-neutral-300"
            onClick={(e) => {
              e.stopPropagation();
              ui.onOpenFile(model.openRelPath!);
            }}
          >
            {model.detail}
          </button>
        ) : model.linkedUrl ? (
          <a
            href={model.linkedUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="min-w-0 max-w-full truncate text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300 hover:decoration-neutral-500"
            title={model.linkedUrl}
            onClick={(e) => e.stopPropagation()}
          >
            {model.linkedUrl}
          </a>
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

  const links =
    model.uiKind !== "read" && model.resultLinks?.length ? (
      <ToolResultLinks links={model.resultLinks ?? []} />
    ) : null;

  const facts =
    model.uiKind === "read" || model.uiKind === "search" || model.uiKind === "expand"
      ? []
      : (model.facts ?? []);
  const factsRow = facts.length ? (
    <div className="mt-1 flex flex-wrap gap-1.5 pl-0.5">
      {facts.map((fact) => (
        <span
          key={`${fact.label}:${fact.value}`}
          className="rounded border border-[var(--basis-border)] bg-[var(--basis-surface)] px-1.5 py-[1px] text-[10px] text-[var(--basis-text-faint)]"
        >
          {fact.label}: {fact.value}
        </span>
      ))}
    </div>
  ) : null;

  if (model.uiKind === "todo") {
    return <TodoToolCard row={row} model={model} />;
  }

  if (model.uiKind === "expand") {
    const hasBody = Boolean(model.expandedText?.trim());
    if (!hasBody) {
      return (
        <div className={`relative ${activityRow}`}>
          <div className="min-w-0">{line}</div>
          {factsRow}
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
    return (
      <details className={`group relative ${activityRow}`}>
        <summary className={activityDetailsSummary}>
          <span className="min-w-0 flex-1">{line}</span>
        </summary>
        {factsRow}
        {links}
        <pre
          className={`thin-scrollbar mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words ${typographyMonoCaption} text-[var(--basis-text-muted)]`}
        >
          {model.expandedText}
        </pre>
        {permission && !permissionSettled ? (
          <PermissionInline
            data={permission}
            settled={permissionSettled}
            onRespond={(outcome) =>
              ui.onPermissionRespond(permission.requestId, outcome)
            }
          />
        ) : null}
      </details>
    );
  }

  if (model.uiKind === "search") {
    const expandableSearch = Boolean(model.expandedText?.trim());
    if (!expandableSearch) {
      return (
        <div
          className={`relative ${activityRow}`}
          onMouseEnter={() => setHoverOpen(true)}
          onMouseLeave={() => setHoverOpen(false)}
        >
          <div className="min-w-0">{line}</div>
          {factsRow}
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
    return (
      <details
        className={`group relative ${activityRow}`}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
      >
        <summary className={activityDetailsSummary}>
          <span className="min-w-0 flex-1">{line}</span>
        </summary>
        {factsRow}
        {links}
        <pre
          className={`thin-scrollbar mt-1 max-h-56 overflow-y-auto whitespace-pre-wrap break-words ${typographyMonoCaption} text-[var(--basis-text-muted)]`}
        >
          {model.expandedText}
        </pre>
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
      </details>
    );
  }

  if (model.uiKind === "edit") {
    return (
      <details className={`group ${activityRow}`}>
        <summary className={activityDetailsSummary}>
          <span className="min-w-0 flex-1">{line}</span>
        </summary>
        {factsRow}
        {links}
        <div className="mt-1">
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
        </div>
        {permission && !permissionSettled ? (
          <PermissionInline
            data={permission}
            settled={permissionSettled}
            onRespond={(outcome) =>
              ui.onPermissionRespond(permission.requestId, outcome)
            }
          />
        ) : null}
      </details>
    );
  }

  const expandable =
    model.uiKind === "terminal" || model.uiKind === "generic"
      ? Boolean(model.expandedText)
      : false;

  if (expandable) {
    return (
      <div className="my-1 w-full max-w-none overflow-hidden rounded-md border border-[var(--basis-border)]">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--basis-surface-hover)]"
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
        {factsRow ? <div className="px-2.5 pb-1">{factsRow}</div> : null}
        {links ? <div className="px-2.5 pb-1">{links}</div> : null}
        {expanded ? (
          <div className="border-t border-[var(--basis-border)]">
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
                className={`thin-scrollbar max-h-64 overflow-y-auto whitespace-pre-wrap break-words p-2.5 ${typographyMonoCaption} text-[var(--basis-text-muted)]`}
              >
                {model.expandedText}
              </pre>
            )}
          </div>
        ) : null}
        {permission && !permissionSettled ? (
          <div className="border-t border-[var(--basis-border)]">
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
      {factsRow}
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
    <details className={`group ${activityRowBare}`}>
      <summary className={`${activityDetailsSummary} px-2`}>
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

function WorkedGroupRowView({
  row,
  onOpenPlan,
  onOpenSubagent,
}: {
  row: Extract<FoldedChatRow, { type: "worked_group" }>;
  onOpenPlan: (path?: string) => void;
  onOpenSubagent: (
    row: Extract<FoldedChatRow, { type: "subagent" }>,
  ) => void | Promise<void>;
}) {
  return (
    <details className={`group ${activityRow}`}>
      <summary className={activityDetailsSummary}>
        <span className="text-neutral-400">{row.label}</span>
      </summary>
      <div className="space-y-1 pt-1">
        {row.items.map((item) => (
          <ChatRowView
            key={`${item.type}-${item.id}`}
            row={item}
            onOpenPlan={onOpenPlan}
            onOpenSubagent={onOpenSubagent}
          />
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
          className="shrink-0 rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface)] px-2 py-1 text-ui-xs text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)]"
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
      <div className="w-full text-[var(--basis-text)]">
          <div className={`${chatInputShell} max-w-none`}>
            <div className={chatUserInner}>
              <MarkdownMessage text={row.text} />
            </div>
          </div>
        </div>
      );
    case "assistant":
      return (
        <div className="w-full text-[var(--basis-text)]">
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
          <div
            className={`thin-scrollbar mt-1 min-h-0 w-full min-w-0 max-h-56 overflow-y-auto overflow-x-hidden overscroll-y-contain ${typographyBodySm}`}
          >
            <MarkdownMessage
              text={row.text.trim()}
              className="chat-markdown--muted"
            />
          </div>
        </details>
      );
    case "tool":
      return <SingleToolRow row={row} />;
    case "tool_explore_group":
      return <ToolExploreGroupRowView row={row} />;
    case "worked_group":
      return (
        <WorkedGroupRowView
          row={row}
          onOpenPlan={onOpenPlan}
          onOpenSubagent={onOpenSubagent}
        />
      );
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
            className={`thin-scrollbar max-h-52 overflow-y-auto whitespace-pre-wrap break-words pt-0.5 ${activityMono}`}
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
          <details className="mt-1 rounded border border-[var(--basis-border)] bg-[var(--basis-surface)]/50 p-1.5">
            <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-[var(--basis-text-faint)]">
              Raw plan JSON
            </summary>
            <pre
              className={`thin-scrollbar mt-1 max-h-80 overflow-y-auto whitespace-pre-wrap break-words ${typographyMonoCaption} text-[var(--basis-text-muted)]`}
            >
              {safeJson(row.data)}
            </pre>
          </details>
        </div>
      );
    case "session_extra":
      return (
        <details className={`group ${activityRow}`}>
          <summary className={activityDetailsSummary}>
            <span className="capitalize text-neutral-400">{row.label}</span>
          </summary>
          <pre
            className={`thin-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words pt-0.5 ${activityMono}`}
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
          <pre className="thin-scrollbar max-h-48 overflow-y-auto whitespace-pre-wrap break-words pt-0.5 font-mono text-ui-xs leading-relaxed text-rose-300/90">
            {safeJson(row.data)}
          </pre>
        </details>
      );
    default:
      return null;
  }
}
