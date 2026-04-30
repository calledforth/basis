import { type ReactNode } from "react";
import {
  TerminalSquare,
  Workflow,
  EyeOff,
  MessageCircleQuestion,
  Image as ImageIcon,
  Plus,
  History,
  Zap,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  FileText,
  Square,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toVaultRelPath } from "../../lib/acpPath";
import type { ThreadBackend } from "../../types";

export const btnIcon =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded p-0 leading-none [&_svg]:block text-[var(--basis-text-muted)] hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)] disabled:pointer-events-none disabled:opacity-40";
export const titleBtnIcon =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded p-0 leading-none [&_svg]:block text-[var(--basis-text-muted)] hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)] disabled:pointer-events-none disabled:opacity-40";

/**
 * Horizontal chat gutter shared by list and composer.
 * List right padding is scrollbar-compensated so user bubbles and composer match visual width.
 */
export const CHAT_GUTTER_PX = 15;
export const CHAT_SCROLLBAR_COMPENSATION_PX = 9;

export function joinFs(root: string, rel: string): string {
  const a = root.replace(/[\\/]+$/, "");
  const b = rel.replace(/^[\\/]+/, "");
  const sep = root.includes("\\") ? "\\" : "/";
  return `${a}${sep}${b}`;
}

export function IconPlus({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <Plus className={className} strokeWidth={1.5} aria-hidden />;
}

export function IconHistory({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <History className={className} strokeWidth={1.5} aria-hidden />;
}

export function IconBolt({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <Zap className={className} strokeWidth={1.5} aria-hidden />;
}

export function IconSend({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <ArrowUp className={className} strokeWidth={1.9} aria-hidden />;
}

export function IconChevronDown({ className = "h-3 w-3" }: { className?: string }) {
  return <ChevronDown className={className} strokeWidth={1.5} aria-hidden />;
}

export function IconFile({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <FileText className={className} strokeWidth={1.5} aria-hidden />;
}

export function IconStop({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return <Square className={className} strokeWidth={1.75} aria-hidden />;
}

export function IconChevronRight({ className = "h-3 w-3" }: { className?: string }) {
  return <ChevronRight className={className} strokeWidth={1.5} aria-hidden />;
}

export function ConnectionDotIndicator({
  phase,
}: {
  phase: "idle" | "spawned" | "initialized" | "authenticated" | "error";
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
      className="inline-flex h-5 w-5 items-center justify-center"
      aria-label={label}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </span>
  );
}

export function backendLabel(backend: ThreadBackend | undefined): string {
  return backend === "opencode" ? "OpenCode" : "Cursor";
}

export function MarkdownMessage({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div
      className={
        className ? `chat-markdown ${className}`.trim() : "chat-markdown"
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul>{children}</ul>,
          ol: ({ children }) => <ol>{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          table: ({ children }) => (
            <div className="chat-markdown-table-wrap">
              <div className="chat-markdown-table-scroll thin-scrollbar">
                <table>{children}</table>
              </div>
            </div>
          ),
          code: ({ children, className, ...props }: any) => (
            <code className={className} {...props}>
              {children}
            </code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function planSummary(data: unknown): string {
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

export function extractPlanOpenPath(
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

export function getModeIcon(modeId: string, className?: string): ReactNode {
  const key = modeId.trim().toLowerCase();
  const base = className ?? "h-3 w-3";
  if (key.includes("agent")) return <TerminalSquare className={base} />;
  if (key.includes("plan")) return <Workflow className={base} />;
  if (key.includes("ask")) return <MessageCircleQuestion className={base} />;
  if (key.includes("edit")) return <ImageIcon className={base} />;
  if (key.includes("no permission")) return <EyeOff className={base} />;
  return <Zap className={base} />;
}

export function formatModelName(valueId: string, rawLabel: string) {
  const normalized = valueId || rawLabel;
  const parts = normalized.split(",");
  const base = parts[0]?.trim() || rawLabel || valueId;
  const options: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const [k, v] = part.split("=");
    if (!k) continue;
    options[k.trim()] = (v ?? "").trim();
  }
  return { base, options };
}
