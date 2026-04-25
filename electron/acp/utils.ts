export function extractSessionId(payload: unknown): string | undefined {
  const p = payload as any;
  return p?.sessionId ?? p?._meta?.sessionId ?? p?.toolCall?.sessionId ?? p?.update?.sessionId;
}

export function isAuthRequiredError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return lower.includes("auth_required") || (lower.includes("auth") && lower.includes("required"));
}
