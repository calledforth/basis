import { typographyBody } from "../lib/typography";

/** Shared shell for composer and user messages — single source of truth for styling */
export const chatInputShell =
  "flex w-full flex-col gap-0.5 rounded-lg border border-[#363636] bg-[#212121] p-1 shadow-sm shadow-black/20";

/** Tighter corners (e.g. home composer) */
export const chatInputShellSm =
  "flex w-full flex-col gap-0.5 rounded-md border border-[#363636] bg-[#212121] p-1 shadow-lg shadow-black/45 ring-1 ring-black/10";

/** Inner typography + padding shared by user bubble text (composer textarea uses tighter vertical padding) */
export const chatUserInner =
  `px-1.5 py-0.5 ${typographyBody} text-[#BCBCBC]`;

/** Inner padding for non-bubble chat stream content (assistant + tool stream) */
export const chatStreamInner =
  `px-2 py-1 ${typographyBody} text-[#BCBCBC]`;

/** Composer only: shorter default row, grows until max then scrolls with panel scrollbar styling */
export const chatComposerTextarea =
  `thin-scrollbar min-h-[38px] w-full resize-none overflow-y-hidden bg-transparent px-2 py-1 ${typographyBody} text-[#BCBCBC] placeholder:text-[#BCBCBC]/45 focus:outline-none disabled:opacity-50`;

export const btnSend =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-neutral-900 transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:pointer-events-none disabled:opacity-40";

export const COMPOSER_TEXTAREA_MIN_PX = 38;
export const COMPOSER_TEXTAREA_MAX_PX = 156;
