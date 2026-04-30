import { typographyBody } from "../lib/typography";

/** Shared shell for composer and user messages — single source of truth for styling */
export const chatInputShell =
  "flex w-full flex-col gap-0.5 rounded-[var(--basis-chat-shell-radius)] border border-[var(--basis-border)] bg-[var(--basis-surface)] p-1 shadow-sm";

/** Tighter corners (e.g. home composer) */
export const chatInputShellSm =
  "flex w-full flex-col gap-0.5 rounded-[var(--basis-chat-shell-radius)] border border-[var(--basis-border)] bg-[var(--basis-surface)] p-1 shadow-lg";

/** Inner typography + padding shared by user bubble text (composer textarea uses tighter vertical padding) */
export const chatUserInner =
  `px-1 py-0.5 ${typographyBody} text-[var(--basis-text)]`;

/** Inner padding for non-bubble chat stream content (assistant + tool stream) */
export const chatStreamInner =
  `px-2 py-1 ${typographyBody} text-[var(--basis-text)]`;

/** Composer only: shorter default row, grows until max then scrolls with panel scrollbar styling */
export const chatComposerTextarea =
  `thin-scrollbar min-h-[38px] w-full resize-none overflow-y-hidden bg-transparent px-2 py-1 ${typographyBody} text-[var(--basis-text)] placeholder:text-[13px] placeholder:text-[color-mix(in_srgb,var(--basis-text)_45%,transparent)] focus:outline-none disabled:opacity-50`;

export const btnSend =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--basis-action-bg)] text-[var(--basis-action-fg)] transition-colors hover:bg-[var(--basis-action-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--basis-border)] disabled:pointer-events-none disabled:opacity-40";

export const COMPOSER_TEXTAREA_MIN_PX = 38;
export const COMPOSER_TEXTAREA_MAX_PX = 156;
