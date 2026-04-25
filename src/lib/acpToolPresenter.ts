import { extractChunkText } from "./acpExtractText";
import { posixBasename, posixDirname, toVaultRelPath } from "./acpPath";

export type ToolUiKind =
  | "search"
  | "read"
  | "edit"
  | "terminal"
  | "web"
  | "generic";

export type ToolSearchHit = {
  relPath?: string;
  filename: string;
  dir: string;
};

export type ToolPresenterModel = {
  uiKind: ToolUiKind;
  /** One-line summary pieces */
  verb: string;
  detail: string;
  statusNote?: string;
  /** For reads: clickable open target */
  openRelPath?: string;
  /** For searches: hover popover hits */
  searchHits?: ToolSearchHit[];
  /** Persisted URLs extracted from tool output/content */
  resultLinks?: string[];
  /** For edits: diff summary */
  diffPath?: string;
  diffAdds?: number;
  diffDels?: number;
  diffOldText?: string;
  diffNewText?: string;
  filename?: string;
  /** Expanded bodies (non-JSON) */
  expandedText?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function toolKindFromRow(kind?: string): string | undefined {
  const k = kind?.trim();
  return k || undefined;
}

function titleLooksLikeGrep(title: string): boolean {
  const t = title.toLowerCase();
  return /\bgrepped\b/.test(t) || /\bgrep\b/.test(t);
}

function splitVerbDetail(title: string, fallbackVerb: string): { verb: string; detail: string } {
  const t = title.trim();
  if (!t) return { verb: fallbackVerb, detail: "…" };
  const m = t.match(/^(\S+)\s+(.+)$/);
  if (m?.[1] && m?.[2]) return { verb: m[1], detail: m[2].trim() };
  return { verb: fallbackVerb, detail: t };
}

function presentRawTitle(title: string, fallback: string): { verb: string; detail: string } {
  const t = title.trim();
  return { verb: t || fallback, detail: "" };
}

function looksLikePath(text: string): boolean {
  return /[\\/]/.test(text) || /\.[A-Za-z0-9]{1,8}$/.test(text);
}

function extractSearchSummary(rawOutput: unknown): string | undefined {
  const r = asRecord(rawOutput);
  if (!r) return undefined;
  if (typeof r.totalMatches === "number") {
    const n = r.totalMatches;
    return `${n} match${n === 1 ? "" : "es"}`;
  }
  if (typeof r.totalFiles === "number") {
    const n = r.totalFiles;
    return `${n} file${n === 1 ? "" : "s"}`;
  }
  if (typeof r.referenceCount === "number") {
    const n = r.referenceCount;
    return `${n} reference${n === 1 ? "" : "s"}`;
  }
  if (r.rejected === true) {
    return typeof r.reason === "string" && r.reason.trim() ? r.reason : "Cancelled";
  }
  return undefined;
}

function extractReadSummary(rawOutput: unknown): string | undefined {
  const r = asRecord(rawOutput);
  if (!r) return undefined;
  if (typeof r.content === "string" && r.content.length) {
    return `${r.content.length} chars`;
  }
  if (typeof r.totalDiagnostics === "number") {
    return `${r.totalDiagnostics} diagnostics`;
  }
  if (typeof r.totalFiles === "number") {
    return `${r.totalFiles} files`;
  }
  return undefined;
}

function collectLocations(row: { locations?: unknown[] }): Array<{ path: string; line?: number }> {
  const out: Array<{ path: string; line?: number }> = [];
  if (!Array.isArray(row.locations)) return out;
  for (const loc of row.locations) {
    const r = asRecord(loc);
    const p = typeof r?.path === "string" ? r.path : "";
    if (!p) continue;
    const line = typeof r?.line === "number" ? r.line : undefined;
    out.push({ path: p, line });
  }
  return out;
}

function extractPathLikeStrings(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;

  const add = (s: string) => {
    const t = s.trim();
    if (!t) return;
    if (!out.includes(t)) out.push(t);
  };

  // file:// URIs
  for (const m of text.matchAll(/\bfile:\/\/[^\s)]+/g)) add(m[0]);

  // Windows paths (simple heuristic)
  for (const m of text.matchAll(/\b[a-zA-Z]:\\(?:[^<>:"|?*\n\r]+\\)*[^<>:"|?*\n\r]+/g)) add(m[0]);

  // *nix-ish paths
  for (const m of text.matchAll(/(?:^|\s)(\/[^\s]+)/g)) add(m[1] ?? m[0]);

  // backtick / quoted paths
  for (const m of text.matchAll(/[`'"]([^`'"]+\.[A-Za-z0-9]{1,8})[`'"]/g)) add(m[1]);

  return out;
}

function scorePathCandidate(p: string): number {
  const base = posixBasename(p);
  let score = base.length;
  if (/\.[A-Za-z0-9]{1,8}$/.test(base)) score += 10;
  if (p.includes("/") || p.includes("\\")) score += 5;
  return score;
}

function bestPathFromText(text: string): string | undefined {
  const cands = extractPathLikeStrings(text);
  if (!cands.length) return undefined;
  cands.sort((a, b) => scorePathCandidate(b) - scorePathCandidate(a));
  return cands[0];
}

function extractPathFromRawInput(rawInput: unknown): string | undefined {
  const r = asRecord(rawInput);
  if (r) {
    const keys = ["path", "file", "filePath", "filepath", "uri", "target", "location", "absPath", "absolutePath"];
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    try {
      const s = JSON.stringify(r);
      const guessed = bestPathFromText(s);
      if (guessed) return guessed;
    } catch {
      // ignore
    }
  }
  if (typeof rawInput === "string") {
    const fromJson = bestPathFromText(rawInput);
    if (fromJson) return fromJson;
  }
  return undefined;
}

function diffLineStats(oldText: string | null | undefined, newText: string): { adds: number; dels: number } {
  const oldLines = (oldText ?? "").split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  // Cheap line delta: good enough for UI counts when hunks aren't provided.
  const adds = Math.max(0, newLines.length - oldLines.length);
  const dels = Math.max(0, oldLines.length - newLines.length);
  return { adds, dels };
}

function extractTextFromContentItems(items: unknown[]): string {
  const chunks: string[] = [];
  for (const item of items) {
    const r = asRecord(item);
    if (!r) continue;
    if (r.type === "content") {
      chunks.push(extractChunkText({ content: r.content }));
      continue;
    }
    if (r.type === "resource_link" && typeof r.uri === "string") {
      chunks.push(r.uri);
    }
  }
  const s = chunks.join("\n").trim();
  return s;
}

function stringifyUnknownOutput(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string") return v;
  const r = asRecord(v);
  if (!r) return undefined;
  const candidates = [
    r.output,
    r.stdout,
    r.stderr,
    r.text,
    r.message,
    r.result,
    r.content,
    r.value
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return undefined;
}

function extractFirstDiff(row: { contentItems: unknown[] }): {
  path?: string;
  oldText?: string;
  newText?: string;
} {
  for (const item of row.contentItems) {
    const r = asRecord(item);
    if (!r) continue;
    if (r.type !== "diff") continue;
    const path = typeof r.path === "string" ? r.path : undefined;
    const newText = typeof r.newText === "string" ? r.newText : "";
    const oldText = typeof r.oldText === "string" ? r.oldText : undefined;
    return { path, oldText, newText };
  }
  return {};
}

function extractTerminalSignal(row: { contentItems: unknown[]; rawOutput?: unknown }): string | undefined {
  for (const item of row.contentItems) {
    const r = asRecord(item);
    if (!r) continue;
    if (r.type !== "terminal") continue;
    if (typeof r.terminalId === "string") return `terminal ${r.terminalId}`;
  }
  const out = asRecord(row.rawOutput);
  const exit = out?.exitStatus;
  const ex = asRecord(exit);
  if (typeof ex?.exitCode === "number") return `exit ${ex.exitCode}`;
  return undefined;
}

export function presentToolRow(args: {
  row: {
    title: string;
    kind?: string;
    status?: string;
    rawInput?: unknown;
    rawOutput?: unknown;
    locations?: unknown[];
    contentItems: unknown[];
    resultLinks?: string[];
  };
  spaceRoot: string;
}): ToolPresenterModel {
  const statusNote = args.row.status?.trim() || "";
  const kind = toolKindFromRow(args.row.kind);
  const title = args.row.title.trim();
  const resultLinks = args.row.resultLinks?.length
    ? [...new Set(args.row.resultLinks.filter((u) => /^https?:\/\//i.test(u)))]
    : undefined;

  const locs = collectLocations(args.row);
  const firstLocPath = locs[0]?.path;

  if (kind === "search" || titleLooksLikeGrep(title)) {
    const { verb, detail } = presentRawTitle(title, "Search");
    const hits: ToolSearchHit[] = [];
    for (const loc of locs) {
      const rel = toVaultRelPath({ spaceRoot: args.spaceRoot, rawPath: loc.path }) ?? loc.path.replaceAll("\\", "/");
      const filename = posixBasename(rel);
      const dir = posixDirname(rel);
      hits.push({ relPath: rel, filename, dir });
    }
    const oneWordTitle = /^[A-Za-z][A-Za-z ]*$/.test(verb) && !verb.includes(":");
    const searchSummary = extractSearchSummary(args.row.rawOutput);
    const detailText =
      detail ||
      searchSummary ||
      (oneWordTitle && hits.length
        ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
        : "");
    return {
      uiKind: "search",
      verb,
      detail: detailText,
      statusNote: statusNote || undefined,
      searchHits: hits.length ? hits : undefined,
      resultLinks
    };
  }

  if (kind === "read") {
    const { verb, detail } = presentRawTitle(title, "Read");
    const pathSource =
      firstLocPath ??
      bestPathFromText(title) ??
      extractPathFromRawInput(args.row.rawInput) ??
      bestPathFromText(stringifyUnknownOutput(args.row.rawOutput) ?? "");
    const rel = pathSource ? toVaultRelPath({ spaceRoot: args.spaceRoot, rawPath: pathSource }) : undefined;
    const openRelPath = rel;
    const fromPath = pathSource && looksLikePath(pathSource) ? posixBasename(pathSource) : undefined;
    const readSummary = extractReadSummary(args.row.rawOutput);
    return {
      uiKind: "read",
      verb,
      detail: detail || fromPath || readSummary || "",
      statusNote: statusNote || undefined,
      openRelPath,
      resultLinks
    };
  }

  if (kind === "edit" || kind === "delete" || kind === "move") {
    const diff = extractFirstDiff(args.row);
    const { verb: titleVerb, detail: titleDetail } = splitVerbDetail(title, "Edited");
    const fromTitle = bestPathFromText(title);
    const fromDetail = bestPathFromText(titleDetail);
    const fromRawInput = extractPathFromRawInput(args.row.rawInput);
    const fromContent = bestPathFromText(extractTextFromContentItems(args.row.contentItems));

    const diffPathRaw =
      diff.path ??
      firstLocPath ??
      fromTitle ??
      fromDetail ??
      fromRawInput ??
      fromContent;
    const rel = diffPathRaw ? toVaultRelPath({ spaceRoot: args.spaceRoot, rawPath: diffPathRaw }) : undefined;
    const filename =
      rel ? posixBasename(rel) : diffPathRaw ? posixBasename(diffPathRaw) : posixBasename(titleDetail || titleVerb || title || "…");
    const stats = diffLineStats(diff.oldText, diff.newText ?? "");
    const { verb } = presentRawTitle(title, "Edited");
      return {
        uiKind: "edit",
        verb,
        detail: "",
        statusNote: statusNote || undefined,
        diffPath: rel ?? diffPathRaw,
        diffAdds: stats.adds,
        diffDels: stats.dels,
        diffOldText: diff.oldText,
        diffNewText: diff.newText,
        filename,
        resultLinks
      };
  }

  if (kind === "execute") {
    const { verb, detail } = presentRawTitle(title, "Ran");
    const terminalNote = extractTerminalSignal(args.row);
    const textOut = extractTextFromContentItems(args.row.contentItems);
    const rawOutText = stringifyUnknownOutput(args.row.rawOutput);
    const expanded = [textOut, rawOutText].filter(Boolean).join("\n").trim();
    return {
      uiKind: "terminal",
      verb,
      detail,
      statusNote: statusNote || terminalNote || undefined,
      expandedText: expanded || undefined,
      resultLinks
    };
  }

  if (kind === "fetch") {
    const { verb, detail } = presentRawTitle(title, "Fetched");
    const textOut = extractTextFromContentItems(args.row.contentItems);
    return {
      uiKind: "web",
      verb,
      detail,
      statusNote: statusNote || undefined,
      expandedText: textOut || undefined,
      resultLinks
    };
  }

  const { verb, detail } = presentRawTitle(title, kind ? kind : "Ran");
  const genericText = extractTextFromContentItems(args.row.contentItems);
  const rawOut = stringifyUnknownOutput(args.row.rawOutput);
  const expanded = [genericText, rawOut].filter(Boolean).join("\n").trim();
  return {
    uiKind: "generic",
    verb,
    detail,
    statusNote: statusNote || undefined,
    expandedText: expanded || undefined,
    resultLinks
  };
}

export function toolRowExploreGroupKind(row: {
  kind?: string;
  title: string;
}): "search" | "read" | null {
  const kind = toolKindFromRow(row.kind);
  const title = row.title.trim();
  if (kind === "search" || titleLooksLikeGrep(title)) return "search";
  if (kind === "read") return "read";
  return null;
}
