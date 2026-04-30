import type { ThreadBackend } from "../types";
import { extractChunkText } from "./acpExtractText";
import { posixBasename, posixDirname, toVaultRelPath } from "./acpPath";

export type ToolUiKind =
  | "search"
  /** One-line verb/detail; optional monospace body toggled via details summary */
  | "expand"
  | "read"
  | "edit"
  | "terminal"
  | "web"
  | "todo"
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
  /** Only for searches: hover popover file hits */
  searchHits?: ToolSearchHit[];
  /** Persisted URLs extracted from tool output/content */
  resultLinks?: string[];
  /** One inline link (e.g. fetch target URL) */
  linkedUrl?: string;
  /** For edits: diff summary */
  diffPath?: string;
  diffAdds?: number;
  diffDels?: number;
  diffOldText?: string;
  diffNewText?: string;
  filename?: string;
  /** Expanded bodies (non-JSON) */
  expandedText?: string;
  /** Structured todos (todowrite) */
  todoItems?: Array<{
    content: string;
    status: string;
    priority?: string;
  }>;
  /** Lightweight facts extracted without dropping raw payloads */
  facts?: Array<{ label: string; value: string }>;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function extractTodos(rawOutput: unknown, rawInput: unknown): Array<{
  content: string;
  status: string;
  priority?: string;
}> {
  const parseTodos = (value: unknown) => {
    if (!Array.isArray(value)) return [] as Array<{
      content: string;
      status: string;
      priority?: string;
    }>;
    const out: Array<{ content: string; status: string; priority?: string }> = [];
    for (const item of value) {
      const rec = asRecord(item);
      if (!rec) continue;
      const content = typeof rec.content === "string" ? rec.content.trim() : "";
      if (!content) continue;
      const status = typeof rec.status === "string" ? rec.status.trim() : "pending";
      const priority =
        typeof rec.priority === "string" && rec.priority.trim()
          ? rec.priority.trim()
          : undefined;
      out.push({ content, status, priority });
    }
    return out;
  };
  const outRec = asRecord(rawOutput);
  const outMeta = asRecord(outRec?.metadata);
  const outTodos = parseTodos(outMeta?.todos);
  if (outTodos.length) return outTodos;
  const inRec = asRecord(rawInput);
  return parseTodos(inRec?.todos);
}

function firstStringDeep(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  for (const v of Object.values(rec)) {
    const nested = firstStringDeep(v, keys);
    if (nested) return nested;
  }
  return undefined;
}

function firstNumberDeep(value: unknown, keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const rec = value as Record<string, unknown>;
  for (const key of keys) {
    const v = rec[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  for (const v of Object.values(rec)) {
    const nested = firstNumberDeep(v, keys);
    if (typeof nested === "number") return nested;
  }
  return undefined;
}

function pushFact(
  facts: Array<{ label: string; value: string }>,
  label: string,
  value: string | number | undefined,
) {
  if (value === undefined || value === null) return;
  const text = typeof value === "number" ? String(value) : value.trim();
  if (!text) return;
  if (facts.some((f) => f.label === label && f.value === text)) return;
  facts.push({ label, value: text });
}

function toolKindFromRow(kind?: string): string | undefined {
  const k = kind?.trim();
  return k || undefined;
}

function titleLooksLikeGrep(title: string): boolean {
  const t = title.toLowerCase();
  return /\bgrepped\b/.test(t) || /\bgrep\b/.test(t);
}

export function titleLooksLikeWebSearch(title: string): boolean {
  const raw = title.trim().toLowerCase();
  return raw === "websearch" || raw === "web search" || /^web\s+search\b/i.test(title.trim());
}

function aggregateSearchHitCount(opts: {
  rawOutput?: unknown;
  locationsLen: number;
  metadataHint?: number;
}): number | undefined {
  if (typeof opts.metadataHint === "number") return opts.metadataHint;
  const n = firstNumberDeep(opts.rawOutput ?? {}, ["totalMatches", "totalFiles", "referenceCount", "matchCount", "count"]);
  if (typeof n === "number") return n;
  if (opts.locationsLen > 0) return opts.locationsLen;
  return undefined;
}

function looksLikePathForPhrase(text: string): boolean {
  return /[\\/]/.test(text) || /\.[A-Za-z0-9]{1,8}$/.test(text);
}

function opencodeSearchPhrase(rawInput: unknown, titleFallbackDetail: string): string {
  const first = firstStringDeep(rawInput, ["query", "pattern", "search", "q", "glob"]);
  const pathish = firstStringDeep(rawInput, ["path", "filePath", "filepath", "file", "target", "uri"]);
  const pick = first ?? titleFallbackDetail.trim() ?? (pathish && looksLikePathForPhrase(pathish) ? pathish : undefined);
  return (pick ?? "").trim();
}

function detailWithOptionalCount(main: string | undefined, count: number | undefined): string {
  const m = main?.trim() ?? "";
  if (typeof count === "number") {
    const matchText = `${count} match${count === 1 ? "" : "es"}`;
    return m ? `${m} ${matchText}` : matchText;
  }
  return m;
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

function codeSearchFallbackFromMergedTitle(title: string): string {
  const m = /^code\s+search\s*:?\s*(.*)$/i.exec(title.trim());
  const inner = (m?.[1] ?? "").trim();
  return inner;
}

function taskFallbackFromMergedTitle(title: string): string {
  const m = /^task\s*:?\s*(.*)$/i.exec(title.trim());
  const inner = (m?.[1] ?? "").trim();
  return inner;
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

function extractOutputPath(rawOutput: unknown): string | undefined {
  const r = asRecord(rawOutput);
  if (!r) return undefined;
  const candidates = ["output", "path", "file", "filePath", "filepath", "uri"];
  for (const key of candidates) {
    const v = r[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function extractMetadataCount(rawOutput: unknown): number | undefined {
  const r = asRecord(rawOutput);
  const meta = asRecord(r?.metadata);
  if (typeof meta?.count === "number") return meta.count;
  if (typeof meta?.matches === "number") return meta.matches;
  return undefined;
}

function extractMetadataTruncated(rawOutput: unknown): boolean | undefined {
  const r = asRecord(rawOutput);
  const meta = asRecord(r?.metadata);
  if (typeof meta?.truncated === "boolean") return meta.truncated;
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
    r.error,
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
  const meta = asRecord(out?.metadata);
  if (typeof meta?.exit === "number") return `exit ${meta.exit}`;
  return undefined;
}

function trimOneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type RawToolEventTitleSource = {
  rawEvents?: Array<{ event: string; data: unknown }>;
};

export function getFirstRawToolEventTitle(row: RawToolEventTitleSource): string {
  const ev = row.rawEvents?.find((entry) => {
    if (!entry || (entry.event !== "tool_call" && entry.event !== "tool_call_update")) return false;
    const rec = asRecord(entry.data);
    return typeof rec?.title === "string" && rec.title.trim().length > 0;
  });
  const rec = asRecord(ev?.data);
  return typeof rec?.title === "string" ? rec.title.trim() : "";
}

export function isTodoWriteToolRow(row: RawToolEventTitleSource): boolean {
  return getFirstRawToolEventTitle(row).toLowerCase() === "todowrite";
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
    rawEvents?: Array<{ event: string; data: unknown }>;
  };
  spaceRoot: string;
  backend?: ThreadBackend;
}): ToolPresenterModel {
  const backend = args.backend ?? "cursor";
  const statusNote = args.row.status?.trim() || "";
  const kind = toolKindFromRow(args.row.kind);
  const title = args.row.title.trim();
  const firstToolRawTitle = getFirstRawToolEventTitle(args.row);
  const resultLinks = args.row.resultLinks?.length
    ? [...new Set(args.row.resultLinks.filter((u) => /^https?:\/\//i.test(u)))]
    : undefined;

  const locs = collectLocations(args.row);
  const firstLocPath = locs[0]?.path;
  const facts: Array<{ label: string; value: string }> = [];
  if (locs.length > 0) pushFact(facts, "locations", locs.length);
  if (args.row.contentItems.length > 0) {
    pushFact(facts, "content items", args.row.contentItems.length);
  }
  const queryCandidate = firstStringDeep(args.row.rawInput, [
    "query",
    "pattern",
    "search",
    "q",
  ]);
  pushFact(facts, "query", queryCandidate);
  const pathCandidate = firstStringDeep(args.row.rawInput, [
    "path",
    "filePath",
    "filepath",
    "file",
    "target",
    "glob",
    "uri",
  ]);
  pushFact(facts, "path", pathCandidate);
  const limitCandidate = firstNumberDeep(args.row.rawInput, ["limit", "head_limit"]);
  pushFact(facts, "limit", limitCandidate);
  const metadataCount = extractMetadataCount(args.row.rawOutput);
  pushFact(facts, "count", metadataCount);
  const truncated = extractMetadataTruncated(args.row.rawOutput);
  if (typeof truncated === "boolean") {
    pushFact(facts, "truncated", truncated ? "true" : "false");
  }

  const searchSurface =
    kind === "search" ||
    titleLooksLikeGrep(title) ||
    (backend === "opencode" && kind === "other" && titleLooksLikeWebSearch(title));

  if (searchSurface) {
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
    const outputPath = extractOutputPath(args.row.rawOutput);
    const outputName =
      outputPath && looksLikePath(outputPath) ? posixBasename(outputPath) : undefined;

    if (backend === "opencode") {
      const displayVerb = firstToolRawTitle.toLowerCase();
      const twoWord = title.trim().match(/^(\S+)\s+(.+)/);
      const fromTitleTail = twoWord?.[2]?.trim() ?? "";
      const phrase = opencodeSearchPhrase(args.row.rawInput, fromTitleTail).trim();
      const countNum = aggregateSearchHitCount({
        rawOutput: args.row.rawOutput,
        locationsLen: locs.length,
        metadataHint: metadataCount,
      });
      let detailLine = detailWithOptionalCount(
        phrase.length ? phrase : undefined,
        countNum !== undefined ? countNum : undefined,
      ).trim();
      if (!detailLine) {
        detailLine =
          detail ||
          outputName ||
          searchSummary ||
          (oneWordTitle && hits.length
            ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
            : "");
      }
      const expandedText =
        stringifyUnknownOutput(args.row.rawOutput) ??
        extractTextFromContentItems(args.row.contentItems) ??
        undefined;
      return {
        uiKind: "search",
        verb: displayVerb || "search",
        detail: detailLine,
        statusNote: statusNote || undefined,
        searchHits: hits.length ? hits : undefined,
        expandedText: expandedText?.trim() || undefined,
        resultLinks,
        facts,
      };
    }

    const detailText =
      detail ||
      outputName ||
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
      expandedText:
        (stringifyUnknownOutput(args.row.rawOutput) ??
          extractTextFromContentItems(args.row.contentItems) ??
          "")
          .trim() || undefined,
      resultLinks,
      facts,
    };
  }

  if (kind === "read") {
    const parsedTitle = splitVerbDetail(title, "Read");
    const pathSource =
      firstLocPath ??
      bestPathFromText(title) ??
      extractPathFromRawInput(args.row.rawInput) ??
      bestPathFromText(extractTextFromContentItems(args.row.contentItems)) ??
      extractOutputPath(args.row.rawOutput) ??
      bestPathFromText(stringifyUnknownOutput(args.row.rawOutput) ?? "");
    const rel = pathSource ? toVaultRelPath({ spaceRoot: args.spaceRoot, rawPath: pathSource }) : undefined;
    const openRelPath = rel;
    const fromPath = pathSource && looksLikePath(pathSource) ? posixBasename(pathSource) : undefined;
    const readSummary = extractReadSummary(args.row.rawOutput);
    const titleDetail = /^read$/i.test(parsedTitle.verb) ? parsedTitle.detail : "";
    return {
      uiKind: "read",
      verb: parsedTitle.verb || "Read",
      detail: fromPath || titleDetail || readSummary || "",
      statusNote: statusNote || undefined,
      openRelPath,
      resultLinks,
      facts
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
    const { verb: titleVerbDisplay } = presentRawTitle(title, "Edited");
    const verb = firstToolRawTitle.trim() || titleVerbDisplay;
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
        resultLinks,
        facts
      };
  }

  if (kind === "execute") {
    const terminalNote = extractTerminalSignal(args.row);
    if (backend === "opencode" && firstToolRawTitle.toLowerCase() === "bash") {
      const displayVerb = firstToolRawTitle.toLowerCase() || "bash";
      const desc = firstStringDeep(args.row.rawInput, ["description"]);
      const cmd = firstStringDeep(args.row.rawInput, ["command"]);
      const d = desc?.trim() ? trimOneLine(desc, 320) : "";
      const c = cmd?.trim() ? trimOneLine(cmd, 320) : "";
      let phrase = "";
      if (d && c) phrase = `${d} ${c}`;
      else phrase = d || c || (title.trim() ? trimOneLine(title, 420) : "");
      const expandedText =
        stringifyUnknownOutput(args.row.rawOutput) ??
        extractTextFromContentItems(args.row.contentItems) ??
        undefined;
      return {
        uiKind: "expand",
        verb: displayVerb,
        detail: phrase,
        statusNote: statusNote || terminalNote || undefined,
        expandedText: expandedText?.trim() || undefined,
        resultLinks,
        facts,
      };
    }
    const { verb, detail } = presentRawTitle(title, "Ran");
    const textOut = extractTextFromContentItems(args.row.contentItems);
    const rawOutText = stringifyUnknownOutput(args.row.rawOutput);
    const expanded = [textOut, rawOutText].filter(Boolean).join("\n").trim();
    return {
      uiKind: "terminal",
      verb,
      detail,
      statusNote: statusNote || terminalNote || undefined,
      expandedText: expanded || undefined,
      resultLinks,
      facts
    };
  }

  if (kind === "fetch") {
    const st = statusNote.toLowerCase();
    const outRec = asRecord(args.row.rawOutput);
    const errField =
      typeof outRec?.error === "string" && outRec.error.trim()
        ? outRec.error.trim()
        : "";
    const done = st === "completed" || st === "success" || st === "succeeded";
    let failed =
      st === "failed" || st === "error" || st === "cancelled" || st === "canceled";
    if (!done && errField) failed = true;
    const verb = failed ? "Fetch attempted" : done ? "Fetched" : "Fetching";
    const rawUrl = firstStringDeep(args.row.rawInput, ["url", "uri", "href"])?.trim() ?? "";
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "";
    const textOut = extractTextFromContentItems(args.row.contentItems).trim();
    const rawOutStr = stringifyUnknownOutput(args.row.rawOutput)?.trim() ?? "";
    const expandedText = [textOut || errField || rawOutStr].filter(Boolean).join("\n\n") || undefined;
    const { verb: fbVerb, detail: fbDetail } = presentRawTitle(title, "Fetch");
    return {
      uiKind: "expand",
      verb,
      detail: url ? "" : (fbDetail.trim() || fbVerb.trim() || title.trim() || "Fetch"),
      linkedUrl: url || undefined,
      statusNote: statusNote || undefined,
      expandedText,
      resultLinks,
      facts
    };
  }

  if (kind === "other" && firstToolRawTitle.toLowerCase() === "codesearch") {
    const displayVerb = firstToolRawTitle.toLowerCase() || "codesearch";
    const twoWord = title.trim().match(/^(\S+)\s+(.+)/);
    const fromTitleTail = twoWord?.[2]?.trim() ?? "";
    const phrase = opencodeSearchPhrase(args.row.rawInput, fromTitleTail).trim();
    const countNum = aggregateSearchHitCount({
      rawOutput: args.row.rawOutput,
      locationsLen: locs.length,
      metadataHint: metadataCount,
    });
    let detailLine = detailWithOptionalCount(
      phrase.length ? phrase : undefined,
      countNum !== undefined ? countNum : undefined,
    ).trim();
    if (!detailLine) {
      detailLine = codeSearchFallbackFromMergedTitle(title);
    }
    const expandedText =
      stringifyUnknownOutput(args.row.rawOutput) ??
      extractTextFromContentItems(args.row.contentItems) ??
      undefined;
    return {
      uiKind: "search",
      verb: displayVerb,
      detail: detailLine,
      statusNote: statusNote || undefined,
      expandedText: expandedText?.trim() || undefined,
      resultLinks,
      facts,
    };
  }

  if (kind === "other" && firstToolRawTitle.toLowerCase() === "task") {
    const displayVerb = firstToolRawTitle.toLowerCase() || "task";
    const desc = firstStringDeep(args.row.rawInput, ["description"]);
    const prompt = firstStringDeep(args.row.rawInput, ["prompt"]);
    const out = asRecord(args.row.rawOutput);
    const meta = asRecord(out?.metadata);
    const modelMeta = asRecord(meta?.model);
    const modelId =
      typeof modelMeta?.modelID === "string" ? modelMeta.modelID.trim() : "";
    const base =
      (desc?.trim() && trimOneLine(desc, 320)) ||
      (title.trim() && trimOneLine(title, 320)) ||
      (prompt?.trim() && trimOneLine(prompt, 320)) ||
      taskFallbackFromMergedTitle(title);
    const detailLine = base && modelId ? `${base} — ${modelId}` : base || modelId;
    const expandedText =
      stringifyUnknownOutput(args.row.rawOutput) ??
      extractTextFromContentItems(args.row.contentItems) ??
      undefined;
    return {
      uiKind: "expand",
      verb: displayVerb,
      detail: detailLine,
      statusNote: statusNote || undefined,
      expandedText: expandedText?.trim() || undefined,
      resultLinks,
      facts,
    };
  }

  if (kind === "other" && firstToolRawTitle.toLowerCase() === "skill") {
    const rawOut = asRecord(args.row.rawOutput);
    const rawMeta = asRecord(rawOut?.metadata);
    const skillName =
      firstStringDeep(args.row.rawInput, ["name"]) ??
      firstStringDeep(args.row.rawOutput, ["name"]) ??
      (typeof rawMeta?.name === "string" ? rawMeta.name : undefined) ??
      "";
    const detailLine = skillName.trim();
    const expandedText =
      stringifyUnknownOutput(args.row.rawOutput) ??
      extractTextFromContentItems(args.row.contentItems) ??
      undefined;
    return {
      uiKind: "expand",
      verb: "load skill",
      detail: detailLine,
      statusNote: statusNote || undefined,
      expandedText: expandedText?.trim() || undefined,
      resultLinks,
      facts,
    };
  }

  if (kind === "other" && firstToolRawTitle.toLowerCase() === "todowrite") {
    const todos = extractTodos(args.row.rawOutput, args.row.rawInput);
    const pendingCount = todos.filter((t) => t.status !== "completed").length;
    const detail =
      pendingCount > 0 ? `${pendingCount} todo${pendingCount === 1 ? "" : "s"}` : "";
    return {
      uiKind: "todo",
      verb: "todos",
      detail,
      statusNote: statusNote || undefined,
      todoItems: todos,
      resultLinks,
      facts,
    };
  }

  const normalizedTitle = title.toLowerCase();
  const titleVerbAlias =
    normalizedTitle === "codesearch"
      ? "codesearch"
      : normalizedTitle === "websearch"
        ? "websearch"
        : normalizedTitle === "task"
          ? "task"
          : "";
  const displayVerb =
    title || titleVerbAlias || (kind && kind !== "other" ? kind : "tool");
  const genericText = extractTextFromContentItems(args.row.contentItems);
  const rawOut = stringifyUnknownOutput(args.row.rawOutput);
  const expanded = [genericText, rawOut].filter(Boolean).join("\n").trim();
  return {
    uiKind: "expand",
    verb: displayVerb,
    detail: statusNote,
    statusNote: statusNote || undefined,
    expandedText: expanded || undefined,
    resultLinks,
    facts
  };
}

export function toolRowExploreGroupKind(row: {
  kind?: string;
  title: string;
}): "search" | "read" | null {
  const kind = toolKindFromRow(row.kind);
  const title = row.title.trim();
  if (kind === "search" || titleLooksLikeGrep(title)) return "search";
  if ((!kind || kind === "other") && titleLooksLikeWebSearch(title)) return "search";
  if (kind === "read") return "read";
  return null;
}
