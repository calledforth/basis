import type { ThreadBackend } from "../core/types.js";

export function extractSessionId(payload: unknown): string | undefined {
  const p = payload as any;
  return p?.sessionId ?? p?._meta?.sessionId ?? p?.toolCall?.sessionId ?? p?.update?.sessionId;
}

/** OpenCode emits synthetic `plan` session updates that mirror todo tool state (see foldAcpEvents plan_update handling). */
export function isTodoSyncedPlanMirrorPayload(
  _update: unknown,
  backend: ThreadBackend
): boolean {
  return backend === "opencode";
}

export function isAuthRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return lower.includes("auth_required") || (lower.includes("auth") && lower.includes("required"));
}
