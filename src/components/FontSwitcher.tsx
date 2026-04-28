import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { typographyBodySm } from "../lib/typography";
import type { WorkspaceLayoutMode } from "../types";
import { btnIcon } from "./acp-chat/uiPrimitives";

const FONTS = [
  { id: "IBM Plex Sans", label: "IBM Plex Sans" },
  { id: "Geist Sans", label: "Geist" },
  { id: "Inter", label: "Inter" },
  { id: "Plus Jakarta Sans", label: "Plus Jakarta" }
];

const DEFAULT_FONT = "IBM Plex Sans";
const DEFAULT_THEME: "dark" | "light" = "dark";
const THEMES: Array<{ id: "dark" | "light"; label: string }> = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" }
];

function normalizeFontId(raw: string | undefined): string {
  if (!raw) return DEFAULT_FONT;
  return raw.replace(/['"]/g, "").trim() || DEFAULT_FONT;
}

type FontSwitcherProps = {
  /** Icon-only (title bar); labeled row + left-aligned menu (file tree) */
  variant?: "icon" | "sidebar";
  workspaceLayout?: WorkspaceLayoutMode;
  onWorkspaceLayoutChange?: (mode: WorkspaceLayoutMode) => void;
};

export function FontSwitcher({ variant = "icon", workspaceLayout, onWorkspaceLayoutChange }: FontSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [activeFont, setActiveFont] = useState(DEFAULT_FONT);
  const [activeTheme, setActiveTheme] = useState<"dark" | "light">(DEFAULT_THEME);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void window.basis.prefs.getApp().then((p) => {
      if (cancelled) return;
      let font = normalizeFontId(p.fontSans);
      let theme = p.themeMode === "light" || p.themeMode === "dark" ? p.themeMode : DEFAULT_THEME;
      if (!p.fontSans) {
        const legacy = localStorage.getItem("basis-font");
        if (legacy) {
          font = normalizeFontId(legacy);
          void window.basis.prefs.setApp({ fontSans: font });
          localStorage.removeItem("basis-font");
        }
      }
      if (!p.themeMode) {
        const legacyTheme = localStorage.getItem("basis-theme");
        if (legacyTheme === "light" || legacyTheme === "dark") {
          theme = legacyTheme;
          void window.basis.prefs.setApp({ themeMode: theme });
        }
      }
      setActiveFont(font);
      setActiveTheme(theme);
      document.documentElement.style.setProperty("--basis-font-sans", font);
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("basis-theme", theme);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleSelect = (fontId: string) => {
    setActiveFont(fontId);
    document.documentElement.style.setProperty("--basis-font-sans", fontId);
    void window.basis.prefs.setApp({ fontSans: fontId });
    setOpen(false);
  };
  const handleThemeSelect = (themeId: "dark" | "light") => {
    setActiveTheme(themeId);
    document.documentElement.dataset.theme = themeId;
    localStorage.setItem("basis-theme", themeId);
    void window.basis.prefs.setApp({ themeMode: themeId });
    setOpen(false);
  };

  const handleWorkspaceLayoutSelect = (mode: WorkspaceLayoutMode) => {
    onWorkspaceLayoutChange?.(mode);
    setOpen(false);
  };

  const isSidebar = variant === "sidebar";
  const showWorkspaceLayout = Boolean(onWorkspaceLayoutChange);
  const activeWorkspaceLayout = workspaceLayout ?? "classic";

  return (
    <div
      className={`title-bar-no-drag relative flex h-full min-w-0 shrink-0 items-center`}
      ref={containerRef}
    >
      <button
        type="button"
        className={
          isSidebar
            ? `inline-flex h-5 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded px-1.5 text-ui-xs text-neutral-200/95 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-500 ${
                open ? "bg-white/[0.1] text-white" : ""
              }`
            : `text-neutral-300 hover:text-neutral-100 ${btnIcon}`
        }
        onClick={() => setOpen(!open)}
        title="Typography and display settings"
      >
        <Settings
          className={isSidebar ? "h-3.5 w-3.5 shrink-0" : "h-3.5 w-3.5"}
          strokeWidth={1.5}
        />
        {isSidebar ? <span className="truncate">Settings</span> : null}
      </button>

      {open && (
        <div
          className={`absolute z-50 min-w-[11rem] max-w-[min(18rem,calc(100vw-1rem))] rounded-md border border-[var(--basis-border)] bg-[var(--basis-surface)] p-1 shadow-lg ${
            isSidebar
              ? "bottom-full left-0 mb-1 origin-bottom"
              : "right-0 top-full mt-1 origin-top-right"
          }`}
        >
          <div className="px-2 py-1.5 text-ui-xs font-medium uppercase tracking-wide text-[var(--basis-text-muted)]">
            Theme
          </div>
          <div className="mb-1 flex flex-col gap-px">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleThemeSelect(theme.id)}
                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left ${typographyBodySm} transition-colors hover:bg-[var(--basis-surface-hover)] ${
                  activeTheme === theme.id
                    ? "bg-[var(--basis-surface-hover)] text-[var(--basis-text-strong)]"
                    : "text-[var(--basis-text)]"
                }`}
              >
                {theme.label}
              </button>
            ))}
          </div>
          <div className="mx-1 mb-1 h-px bg-[var(--basis-border)]/90" />
          {showWorkspaceLayout ? (
            <>
              <div className="px-2 py-1.5 text-ui-xs font-medium uppercase tracking-wide text-[var(--basis-text-muted)]">
                Workspace layout
              </div>
              <div className="mb-1 flex flex-col gap-px">
                <button
                  type="button"
                  onClick={() => handleWorkspaceLayoutSelect("classic")}
                  className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left ${typographyBodySm} transition-colors hover:bg-[var(--basis-surface-hover)] ${
                    activeWorkspaceLayout === "classic"
                      ? "bg-[var(--basis-surface-hover)] text-[var(--basis-text-strong)]"
                      : "text-[var(--basis-text)]"
                  }`}
                >
                  Classic — chat left
                </button>
                <button
                  type="button"
                  onClick={() => handleWorkspaceLayoutSelect("columns")}
                  className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left ${typographyBodySm} transition-colors hover:bg-[var(--basis-surface-hover)] ${
                    activeWorkspaceLayout === "columns"
                      ? "bg-[var(--basis-surface-hover)] text-[var(--basis-text-strong)]"
                      : "text-[var(--basis-text)]"
                  }`}
                >
                  Columns — tree, chat, editor
                </button>
              </div>
              <div className="mx-1 mb-1 h-px bg-[var(--basis-border)]/90" />
            </>
          ) : null}
          <div className="px-2 py-1.5 text-ui-xs font-medium uppercase tracking-wide text-[var(--basis-text-muted)]">
            Typography
          </div>
          <div className="flex flex-col gap-px">
            {FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => handleSelect(font.id)}
                className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left ${typographyBodySm} transition-colors hover:bg-[var(--basis-surface-hover)] ${
                  activeFont === font.id
                    ? "bg-[var(--basis-surface-hover)] text-[var(--basis-text-strong)]"
                    : "text-[var(--basis-text)]"
                }`}
                style={{ fontFamily: `${font.id}, system-ui, sans-serif` }}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
