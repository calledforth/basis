import { useEffect, useState, type ReactNode } from "react";
import { Home, Minus, Square, Copy, X, ChevronLeft } from "lucide-react";
import { typographyBody } from "../lib/typography";

const thinStroke = { strokeWidth: 0.75, vectorEffect: "non-scaling-stroke" as const };

// ─── Shared token: all small square icon buttons in the title bar ───────────
const titleBarIconBtn =
  "title-bar-no-drag inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--basis-text-muted)] transition-colors hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)]";

/** Vault + space label row — same metrics as app body (`--basis-*`) */
const titleBarBreadcrumbWrap =
  `inline-flex min-w-0 max-w-full items-center gap-x-1.5 ${typographyBody} text-[var(--basis-text)]`;

/** Home control inside the breadcrumb */
const titleBarHomeBtn =
  "title-bar-no-drag -ml-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--basis-text)] transition-colors hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)]";

// ─── Window control buttons: full bar height, wider than icon buttons ────────
// Shared base — only hover-bg/color differs between normal and close
const winCtrlBtnBase =
  "title-bar-no-drag inline-flex h-8 w-9 shrink-0 items-center justify-center text-[var(--basis-text-muted)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)]";

const winCtrlBtn    = `${winCtrlBtnBase} hover:bg-[var(--basis-tab-active-bg)] hover:text-[var(--basis-text)]`;
const winCloseBtn   = `${winCtrlBtnBase} hover:bg-rose-600/95 hover:!text-white hover:[&_svg]:!text-white`;

/** Standalone centered title (e.g. vault setup, logs) — matches breadcrumb typography */
const titleBarTitleText =
  `pointer-events-none ${typographyBody} text-[var(--basis-text)]`;

/**
 * Trailing text button (e.g. Logs).
 * Uses the same --basis-* typography tokens as the rest of the bar,
 * and `rounded` to match all other bar controls (was: rounded-md + hardcoded type values).
 */
const titleBarTrailingBtn =
  `title-bar-no-drag inline-flex items-center justify-center rounded px-3 py-1.5 ${typographyBody} text-[var(--basis-text-muted)] transition-colors hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)]`;

function hasWinApi(): boolean {
  return typeof window !== "undefined" && Boolean(window.basis?.win);
}

// ─── Icons — all accept an optional className; default size unified to "h-4 w-4" ──

function IconHome({ className = "h-4 w-4" }: { className?: string }) {
  return <Home className={className} strokeWidth={1.5} />;
}

function IconMinimize({ className = "h-4 w-4" }: { className?: string }) {
  return <Minus className={className} strokeWidth={1} />;
}

function IconMaximize({ className = "h-4 w-4" }: { className?: string }) {
  return <Square className={className} strokeWidth={1} />;
}

function IconRestore({ className = "h-4 w-4" }: { className?: string }) {
  return <Copy className={className} strokeWidth={1} />;
}

function IconClose({ className = "h-4 w-4" }: { className?: string }) {
  return <X className={className} strokeWidth={1} />;
}

function IconChevronLeft({ className = "h-4 w-4" }: { className?: string }) {
  return <ChevronLeft className={className} strokeWidth={1.5} />;
}

// ─── Window controls ─────────────────────────────────────────────────────────

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.basis?.win;
    if (!api) return;
    void api.isMaximized().then(setMaximized);
    return api.onMaximized(setMaximized);
  }, []);

  if (!hasWinApi()) return null;

  // Safe: hasWinApi() already confirmed basis.win is present
  const api = window.basis.win!;

  return (
    <div className="flex shrink-0 items-stretch">
      <button type="button" className={winCtrlBtn} title="Minimize" aria-label="Minimize window" onClick={() => void api.minimize()}>
        <IconMinimize />
      </button>
      <button
        type="button"
        className={winCtrlBtn}
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore window" : "Maximize window"}
        onClick={() => void api.toggleMaximize()}
      >
        {maximized ? <IconRestore /> : <IconMaximize />}
      </button>
      <button type="button" className={winCloseBtn} title="Close" aria-label="Close window" onClick={() => void api.close()}>
        <IconClose />
      </button>
    </div>
  );
}

// ─── TitleBar ────────────────────────────────────────────────────────────────

export type TitleBarProps = {
  /** Left cluster (e.g. home); each control should use no-drag via wrapper */
  leading?: ReactNode;
  /** Centered title area (text only recommended for drag) */
  center: ReactNode;
  /** Right cluster before window controls */
  trailing?: ReactNode;
};

export function TitleBar({ leading, center, trailing }: TitleBarProps) {
  return (
    <header className="title-bar-drag grid h-8 shrink-0 grid-cols-[1fr_auto_1fr] items-stretch bg-canvas">
      <div className="title-bar-no-drag flex min-w-0 items-center justify-start gap-0.5 px-1">{leading}</div>
      <div className="flex min-w-0 max-w-[min(100vw,42rem)] flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-0 px-2 text-center select-none">
        {center}
      </div>
      <div className="title-bar-no-drag flex min-w-0 items-center justify-end gap-0.5 pl-1 pr-0">
        {trailing}
        <WindowControls />
      </div>
    </header>
  );
}

export { IconChevronLeft, IconHome, titleBarBreadcrumbWrap, titleBarHomeBtn, titleBarIconBtn, titleBarTitleText, titleBarTrailingBtn };
