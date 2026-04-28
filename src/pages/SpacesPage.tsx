import { useCallback, useLayoutEffect, useRef, useState, useEffect } from "react";
import { ArrowUp, ChevronsUpDown, ChevronDown, Plus, Hash, MoreHorizontal, MessageSquare, FileText, Clock, PenLine, Trash2 } from "lucide-react";
import type { SpaceListItem } from "../types";
import { TitleBar, titleBarBreadcrumbWrap } from "../components/TitleBar";
import { vaultBasename } from "../lib/vaultBasename";
import { typographyBodySm, typographyLabel } from "../lib/typography";
import { HalftoneStudioArt } from "../components/HalftoneStudioArt";
import {
  btnSend,
  chatComposerTextarea,
  chatInputShellSm,
  COMPOSER_TEXTAREA_MAX_PX,
  COMPOSER_TEXTAREA_MIN_PX
} from "../components/chatComposerStyles";

function IconSend({ className }: { className?: string }) {
  return <ArrowUp className={className} strokeWidth={1.5} />;
}

type SpacesPageProps = {
  vaultPath: string;
  spaces: SpaceListItem[];
  onPickVault: () => void | Promise<void>;
  onCreateSpace: (title?: string) => void | Promise<void>;
  onOpenSpace: (space: SpaceListItem) => void | Promise<void>;
  onRenameSpace: (slug: string, newTitle: string) => void | Promise<void>;
  onDeleteSpace: (slug: string) => void | Promise<void>;
};

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return "Just now";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Just now";
  
  const diffMinutes = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return `${Math.floor(diffDays / 30)}mo`;
}

function SpaceCard({ space, onOpen, onRename, onDelete }: { space: SpaceListItem, onOpen: () => void, onRename: () => void, onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const fCount = space.fileCount ?? 0;
  const tCount = space.chatCount ?? 0;
  const timeStr = formatRelativeTime(space.lastAccessedAt || space.updated || space.created);

  return (
    <div
      className={`group relative flex min-h-[4.5rem] cursor-pointer flex-col justify-between rounded-md border border-[var(--basis-border-muted)] bg-[var(--basis-surface)] p-2 text-left hover:border-[var(--basis-border)] hover:bg-[var(--basis-surface-elevated)] ${menuOpen ? "z-50" : "z-0"}`}
      role="button"
      tabIndex={0}
      aria-label={`Open space ${space.title}`}
      onClick={() => onOpen()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="absolute right-1.5 top-1.5 z-20" ref={menuRef}>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-[var(--basis-text-muted)] opacity-0 hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text)] group-hover:opacity-100 focus:opacity-100 focus:outline-none"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        
        {menuOpen && (
          <div className="absolute right-0 top-full z-[100] mt-0.5 w-28 overflow-hidden rounded border border-[var(--basis-border)] bg-[var(--basis-surface)] p-0.5 shadow-xl shadow-black/30">
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs font-medium text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text-strong)] focus:outline-none focus:bg-[var(--basis-surface-hover)]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onRename();
              }}
            >
              <PenLine className="h-3.5 w-3.5 text-[var(--basis-text-muted)] shrink-0" />
              <span className="truncate">Rename</span>
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 focus:outline-none focus:bg-rose-500/10"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-3.5 w-3.5 opacity-80 shrink-0" />
              <span className="truncate">Delete</span>
            </button>
          </div>
        )}
      </div>

      <div className="relative z-10 pr-6">
        <h3 className={`truncate ${typographyLabel} text-[var(--basis-text-strong)] font-medium tracking-tight leading-snug`}>
          {space.title}
        </h3>
      </div>
      
      <div className="relative z-10 mt-2 flex items-center gap-2 text-[11px] font-medium text-[var(--basis-text-muted)]">
        <div className="flex items-center gap-1.5" title={`${fCount} files`}>
          <FileText className="h-3.5 w-3.5" />
          <span>{fCount}</span>
        </div>
        <div className="flex items-center gap-1.5" title={`${tCount} chats`}>
          <MessageSquare className="h-3.5 w-3.5" />
          <span>{tCount}</span>
        </div>
        <div className="flex items-center gap-1.5 ml-auto" title={`Last opened: ${timeStr}`}>
          <Clock className="h-3.5 w-3.5" />
          <span>{timeStr}</span>
        </div>
      </div>
    </div>
  );
}

export function SpacesPage({ vaultPath, spaces, onPickVault, onCreateSpace, onOpenSpace, onRenameSpace, onDeleteSpace }: SpacesPageProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedSpaceSlug, setSelectedSpaceSlug] = useState<string | null>(null);
  const [spaceSelectorOpen, setSpaceSelectorOpen] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setSpaceSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const syncComposerHeight = useCallback(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const clamped = Math.min(Math.max(scrollH, COMPOSER_TEXTAREA_MIN_PX), COMPOSER_TEXTAREA_MAX_PX);
    el.style.height = `${clamped}px`;
    el.style.overflowY = scrollH > COMPOSER_TEXTAREA_MAX_PX ? "auto" : "hidden";
  }, []);

  useLayoutEffect(() => {
    syncComposerHeight();
  }, [draftTitle, syncComposerHeight]);

  useLayoutEffect(() => {
    const onResize = () => syncComposerHeight();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncComposerHeight]);

  const submitCreate = useCallback(async () => {
    const t = draftTitle.trim();
    if (!t && selectedSpaceSlug === null) return;

    if (t) {
      sessionStorage.setItem("basis-pending-prompt", t);
    }

    setIsCreating(true);
    try {
      if (selectedSpaceSlug === null) {
        await onCreateSpace(t || undefined);
      } else {
        const spaceToOpen = spaces.find((s) => s.slug === selectedSpaceSlug);
        if (spaceToOpen) {
          await onOpenSpace(spaceToOpen);
        } else {
          // Fallback if not found
          await onCreateSpace(t || undefined);
        }
      }
      setDraftTitle("");
    } finally {
      setIsCreating(false);
    }
  }, [draftTitle, selectedSpaceSlug, spaces, onCreateSpace, onOpenSpace]);

  return (
    <main className="flex h-full min-h-0 flex-col bg-canvas text-neutral-100">
      <TitleBar
        center={
          <button
            type="button"
            className={`${titleBarBreadcrumbWrap} title-bar-no-drag group max-w-[min(24rem,70vw)] rounded px-1.5 py-0.5 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5c5c5c]`}
            onClick={() => void onPickVault()}
            title="Change vault"
          >
            <span className="min-w-0 truncate text-[13px] font-medium tracking-tight" title={vaultPath}>
              {vaultBasename(vaultPath)}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f] group-hover:text-[#BCBCBC]" strokeWidth={1.5} />
          </button>
        }
      />

      <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {/* Full-bleed halftone (Halftone Studio config): vignette + fade into composer */}
        <div
          className="relative isolate mb-0 w-full shrink-0 overflow-hidden"
          style={{ backgroundColor: "var(--basis-surface-elevated)" }}
        >
          <HalftoneStudioArt className="relative z-0 h-60 w-full sm:h-64 md:h-72" />
          <div className="halftone-scanlines pointer-events-none absolute inset-0 z-[1] opacity-[0.42]" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              boxShadow:
                "inset 0 0 72px 36px color-mix(in srgb, var(--basis-canvas-bg) 55%, transparent), inset 0 14px 28px -10px color-mix(in srgb, var(--basis-canvas-bg) 30%, transparent)"
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-[min(28%,9rem)]"
            style={{
              background:
                "linear-gradient(to right, color-mix(in srgb, var(--basis-canvas-bg) 42%, transparent) 8%, transparent 70%)"
            }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-[min(28%,9rem)]"
            style={{
              background:
                "linear-gradient(to left, color-mix(in srgb, var(--basis-canvas-bg) 42%, transparent) 8%, transparent 70%)"
            }}
            aria-hidden
          />
          {/* Long fade so halftone reads into the composer; sits above composer in z-order */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-36 sm:h-44 md:h-52"
            style={{
              background:
                "linear-gradient(to bottom, transparent 8%, color-mix(in srgb, var(--basis-canvas-bg) 55%, transparent), var(--basis-canvas-bg))"
            }}
            aria-hidden
          />
        </div>

        <div className="relative z-10 mx-auto -mt-28 flex w-full max-w-5xl flex-1 flex-col items-center px-6 pb-10 pt-0 sm:-mt-32 md:-mt-36">
          <div className="w-full max-w-3xl shrink-0">
            <div className={chatInputShellSm}>
              <textarea
                ref={promptRef}
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="what do u wanna explore.."
                rows={1}
                disabled={isCreating}
                className={chatComposerTextarea}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitCreate();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2 pb-0.5 pl-0.5 pr-0.5 pt-0">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5" ref={selectorRef}>
                    <div className="relative">
                      <button
                        type="button"
                        disabled={isCreating}
                        className="inline-flex h-6 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium text-[var(--basis-text-muted)] transition-colors hover:bg-[var(--basis-surface-elevated)] hover:text-[var(--basis-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--basis-text-muted)] disabled:opacity-50"
                        onClick={() => setSpaceSelectorOpen((o) => !o)}
                      >
                        {selectedSpaceSlug === null ? (
                          <Plus className="h-3.5 w-3.5" />
                        ) : (
                          <Hash className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate max-w-[140px]">
                          {selectedSpaceSlug === null
                            ? "New space"
                            : spaces.find((s) => s.slug === selectedSpaceSlug)?.title || "Unknown space"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-neutral-500" />
                      </button>

                      {spaceSelectorOpen && (
                        <div className="absolute top-full left-0 z-50 mt-1.5 w-56 rounded border border-[var(--basis-border)] bg-[var(--basis-surface)] p-1 shadow-xl shadow-black/30">
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)]"
                          onClick={() => {
                            setSelectedSpaceSlug(null);
                            setSpaceSelectorOpen(false);
                          }}
                        >
                          <Plus className="h-4 w-4 text-[var(--basis-text-muted)]" />
                          New space
                        </button>
                        {spaces.length > 0 && (
                          <>
                            <div className="my-1 h-px bg-[var(--basis-border)]" />
                            <div className="thin-scrollbar max-h-48 overflow-y-auto">
                              {spaces.map((s) => (
                                <button
                                  key={s.slug}
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-[var(--basis-text)] hover:bg-[var(--basis-surface-hover)] hover:text-[var(--basis-text-strong)]"
                                  onClick={() => {
                                    setSelectedSpaceSlug(s.slug);
                                    setSpaceSelectorOpen(false);
                                  }}
                                >
                                  <Hash className="h-4 w-4 text-[var(--basis-text-muted)] shrink-0" />
                                  <span className="truncate">{s.title}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={btnSend}
                  aria-label="Send message"
                  disabled={isCreating}
                  onClick={() => void submitCreate()}
                >
                  <IconSend className="h-3 w-3 -translate-y-px" />
                </button>
              </div>
            </div>
          </div>

            <section className="mt-10 w-full">
            <h2 className="sr-only">Spaces</h2>
            {spaces.length === 0 ? (
              <p className={`text-center ${typographyBodySm} text-neutral-600`}>No spaces yet - create one above.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {spaces.map((space) => (
                  <SpaceCard
                    key={space.slug}
                    space={space}
                    onOpen={() => void onOpenSpace(space)}
                    onRename={() => {
                      const newTitle = prompt("Enter new name for space:", space.title);
                      if (newTitle && newTitle.trim()) {
                        void onRenameSpace(space.slug, newTitle.trim());
                      }
                    }}
                    onDelete={() => {
                      if (confirm(`Are you sure you want to delete "${space.title}"? This cannot be undone.`)) {
                        void onDeleteSpace(space.slug);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
