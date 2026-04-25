import type { AcpPermissionRequestEventData, AcpTranslatedEvent } from "../types";
import { chunkMessageId, extractChunkText } from "./acpExtractText";
import { toolRowExploreGroupKind } from "./acpToolPresenter";

export type ConnectionDot = "idle" | "spawned" | "initialized" | "authenticated" | "error";

export type FoldedToolRow = {
  type: "tool";
  id: string;
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
  rawInput?: unknown;
  rawOutput?: unknown;
  locations?: unknown[];
  contentItems: unknown[];
  resultLinks?: string[];
  permission?: AcpPermissionRequestEventData;
};

export type FoldedToolExploreGroupRow = {
  type: "tool_explore_group";
  id: string;
  explore: "search" | "read";
  items: FoldedToolRow[];
};

export type FoldedSubagentRow = {
  type: "subagent";
  id: string;
  title: string;
  subtitle?: string;
  state: "running" | "completed" | "failed" | "unknown";
  model?: string;
  toolCount?: number;
  targetSessionId?: string;
  raw: unknown;
};

export type FoldedChatRow =
  | { type: "user"; id: string; text: string }
  | { type: "assistant"; id: string; text: string }
  | { type: "thinking"; id: string; text: string }
  | FoldedToolRow
  | FoldedToolExploreGroupRow
  | { type: "permission"; id: string; data: AcpPermissionRequestEventData }
  | {
      type: "extension";
      id: string;
      event: "extension_request" | "extension_notification";
      method?: string;
      data: unknown;
    }
  | FoldedSubagentRow
  | { type: "plan"; id: string; data: unknown }
  | { type: "session_extra"; id: string; label: string; data: unknown }
  | { type: "error"; id: string; data: unknown };

function sortEventsChrono(events: AcpTranslatedEvent[]): AcpTranslatedEvent[] {
  return [...events].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    const t = a.at.localeCompare(b.at);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

export function deriveConnectionDot(events: AcpTranslatedEvent[]): ConnectionDot {
  const sorted = sortEventsChrono(events);
  let phase: ConnectionDot = "idle";
  for (const e of sorted) {
    if (e.category === "lifecycle" && e.event === "process_spawned") {
      phase = "spawned";
      continue;
    }
    if (e.event === "rpc_error") {
      phase = "error";
      continue;
    }
    if (e.category !== "lifecycle") continue;
    if (phase === "error") continue;
    if (e.event === "initialized") phase = "initialized";
    else if (e.event === "authenticated") phase = "authenticated";
  }
  return phase;
}

function ensureToolRow(
  rows: FoldedChatRow[],
  pushRow: (row: FoldedChatRow) => void,
  toolIndex: Map<string, number>,
  toolCallId: string,
  defaults: Partial<FoldedToolRow>
): FoldedToolRow {
  const existingIdx = toolIndex.get(toolCallId);
  if (existingIdx !== undefined) {
    const row = rows[existingIdx];
    if (row?.type === "tool") return row;
  }
  const row: FoldedToolRow = {
    type: "tool",
    id: toolCallId,
    toolCallId,
    title: typeof defaults.title === "string" ? defaults.title : "Tool",
    kind: defaults.kind,
    status: defaults.status,
    rawInput: defaults.rawInput,
    rawOutput: defaults.rawOutput,
    locations: defaults.locations,
    contentItems: Array.isArray(defaults.contentItems) ? [...defaults.contentItems] : []
  };
  toolIndex.set(toolCallId, rows.length);
  pushRow(row);
  return row;
}

function extractUrlsFromText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\bhttps?:\/\/[^\s)'"`<>]+/gi)) {
    const url = m[0].trim();
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

function collectUrlsDeep(value: unknown, out: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    for (const u of extractUrlsFromText(value)) {
      if (!out.includes(u)) out.push(u);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsDeep(item, out);
    return;
  }
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === "string" && /^(url|uri|href)$/i.test(k) && /^https?:\/\//i.test(v)) {
        if (!out.includes(v)) out.push(v);
      }
      collectUrlsDeep(v, out);
    }
  }
}

function extractToolUrls(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  if ("rawOutput" in data) collectUrlsDeep(data.rawOutput, out);
  if ("content" in data) collectUrlsDeep(data.content, out);
  if ("item" in data) collectUrlsDeep(data.item, out);
  return out;
}

function mergeToolUpdate(row: FoldedToolRow, data: Record<string, unknown>) {
  if (typeof data.title === "string") row.title = data.title;
  if (typeof data.kind === "string") row.kind = data.kind;
  if (typeof data.status === "string") row.status = data.status;
  if ("rawInput" in data) row.rawInput = data.rawInput;
  if ("rawOutput" in data) row.rawOutput = data.rawOutput;
  if (Array.isArray(data.locations)) row.locations = data.locations;
  if (Array.isArray(data.content)) row.contentItems = [...(data.content as unknown[])];
  const urls = extractToolUrls(data);
  if (urls.length) {
    row.resultLinks = [...new Set([...(row.resultLinks ?? []), ...urls])];
  }
}

function parseSubagentRow(ev: AcpTranslatedEvent, envelope: Record<string, unknown>): FoldedSubagentRow | null {
  const method = typeof envelope.method === "string" ? envelope.method : "";
  if (method !== "cursor/task") return null;

  const params = envelope.params;
  const p = params && typeof params === "object" ? (params as Record<string, unknown>) : {};

  const pickString = (...keys: string[]) => {
    for (const k of keys) {
      const v = p[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return undefined;
  };

  const title = pickString("title", "name", "taskTitle", "label") ?? "Subagent";
  const subtitle = pickString("description", "subtitle", "summary");

  const stateRaw = pickString("status", "state", "phase")?.toLowerCase();
  let state: FoldedSubagentRow["state"] = "unknown";
  if (stateRaw) {
    if (/(run|progress|active|pending|starting)/.test(stateRaw)) state = "running";
    else if (/(complete|done|success)/.test(stateRaw)) state = "completed";
    else if (/(fail|error|cancel)/.test(stateRaw)) state = "failed";
  }

  const model = pickString("model", "modelName", "modelId", "currentModel", "currentModelId");
  const toolCount =
    typeof p.toolCount === "number"
      ? p.toolCount
      : typeof p.tools === "number"
        ? p.tools
        : typeof p.toolCalls === "number"
          ? p.toolCalls
          : undefined;

  const targetSessionId =
    typeof p.sessionId === "string"
      ? p.sessionId
      : typeof p.childSessionId === "string"
        ? p.childSessionId
        : typeof p.taskSessionId === "string"
          ? p.taskSessionId
          : undefined;

  return {
    type: "subagent",
    id: ev.id,
    title,
    subtitle,
    state,
    model,
    toolCount,
    targetSessionId,
    raw: envelope
  };
}

function foldExploreGroups(rows: FoldedChatRow[]): FoldedChatRow[] {
  const out: FoldedChatRow[] = [];

  let current: { kind: "search" | "read"; items: FoldedToolRow[] } | null = null;

  const flush = () => {
    if (!current) return;
    if (current.items.length >= 2) {
      out.push({
        type: "tool_explore_group",
        id: `explore:${current.kind}:${current.items[0]?.toolCallId ?? current.items[0]?.id ?? "group"}`,
        explore: current.kind,
        items: current.items
      });
    } else {
      for (const item of current.items) out.push(item);
    }
    current = null;
  };

  for (const row of rows) {
    if (row.type !== "tool") {
      flush();
      out.push(row);
      continue;
    }

    const g = toolRowExploreGroupKind(row);
    if (!g) {
      flush();
      out.push(row);
      continue;
    }

    if (!current || current.kind !== g) {
      flush();
      current = { kind: g, items: [row] };
      continue;
    }

    current.items.push(row);
  }

  flush();
  return out;
}

function isSearchTitle(title: string): boolean {
  return /^(web search|find|grep)\b/i.test(title.trim());
}

function findBestToolRowForPermission(
  rows: FoldedChatRow[],
  requestedToolCallId: string,
  tc: Record<string, unknown> | null
): FoldedToolRow | null {
  const byId = rows.find(
    (r): r is FoldedToolRow => r.type === "tool" && r.toolCallId === requestedToolCallId
  );
  if (byId) return byId;

  const kind = typeof tc?.kind === "string" ? tc.kind : "";
  const title = typeof tc?.title === "string" ? tc.title : "";
  const wantSearch = kind === "search" || isSearchTitle(title);
  if (!wantSearch) return null;

  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r?.type !== "tool") continue;
    if (r.permission) continue;
    const rKind = typeof r.kind === "string" ? r.kind : "";
    const rTitle = typeof r.title === "string" ? r.title : "";
    if (rKind === "search" && isSearchTitle(rTitle)) return r;
  }
  return null;
}

function normalizePermission(data: unknown, fallbackId: string): AcpPermissionRequestEventData | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const requestId = typeof d.requestId === "string" ? d.requestId : fallbackId;
  const sessionId = typeof d.sessionId === "string" ? d.sessionId : "";
  const rawOpts = d.options;
  const options = Array.isArray(rawOpts)
    ? rawOpts
        .map((o) => {
          if (!o || typeof o !== "object") return null;
          const opt = o as Record<string, unknown>;
          const optionId = typeof opt.optionId === "string" ? opt.optionId : "";
          const name = typeof opt.name === "string" ? opt.name : optionId;
          const kind = typeof opt.kind === "string" ? opt.kind : undefined;
          if (!optionId) return null;
          return { optionId, name, kind };
        })
        .filter(Boolean)
    : [];
  return {
    requestId,
    sessionId,
    toolCall: d.toolCall,
    options: options as AcpPermissionRequestEventData["options"],
    _meta: d._meta
  };
}

const rowKey = (type: FoldedChatRow["type"], id: string) => `${type}:${id}`;

export function foldAcpEvents(events: AcpTranslatedEvent[], opts?: { debugDetachedPermissions?: boolean }): FoldedChatRow[] {
  const debugDetachedPermissions = Boolean(opts?.debugDetachedPermissions);
  const sorted = sortEventsChrono(events);
  const rows: FoldedChatRow[] = [];
  const rowIndexByKey = new Map<string, FoldedChatRow>();
  const toolIndex = new Map<string, number>();
  let thinkingBuf = "";
  let thinkingStartEventId = "";
  let userMsgKey: string | undefined;
  let assistantMsgKey: string | undefined;
  let activeUserRowId: string | undefined;
  let activeAssistantRowId: string | undefined;
  let pendingPrompt: { id: string; text: string } | null = null;

  const makeId = () => crypto.randomUUID();

  const pushRow = (row: FoldedChatRow) => {
    rowIndexByKey.set(rowKey(row.type, row.id), row);
    rows.push(row);
  };

  const flushThinkingNow = () => {
    if (thinkingBuf.trim()) {
      pushRow({ type: "thinking", id: thinkingStartEventId || makeId(), text: thinkingBuf });
    }
    thinkingBuf = "";
    thinkingStartEventId = "";
  };

  const flushPendingPrompt = () => {
    if (!pendingPrompt) return;
    if (pendingPrompt.text.trim()) {
      pushRow({ type: "user", id: pendingPrompt.id, text: pendingPrompt.text });
    }
    pendingPrompt = null;
  };

  const rowById = <T extends FoldedChatRow["type"]>(id: string | undefined, type: T): Extract<FoldedChatRow, { type: T }> | undefined => {
    if (!id) return undefined;
    const row = rowIndexByKey.get(rowKey(type, id));
    if (!row || row.type !== type) return undefined;
    return row as Extract<FoldedChatRow, { type: T }>;
  };

  const breakAssistantRun = () => {
    assistantMsgKey = undefined;
    activeAssistantRowId = undefined;
  };

  for (const ev of sorted) {
    const data = ev.data;
    const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};

    switch (ev.event) {
      case "prompt_started": {
        flushThinkingNow();
        flushPendingPrompt();
        userMsgKey = undefined;
        assistantMsgKey = undefined;
        activeUserRowId = undefined;
        activeAssistantRowId = undefined;
        const promptText = typeof d.prompt === "string" ? d.prompt : "";
        pendingPrompt = { id: ev.id, text: promptText };
        break;
      }
      case "user_message_chunk": {
        flushThinkingNow();
        flushPendingPrompt();
        pendingPrompt = null;
        const mid = chunkMessageId(data);
        const piece = extractChunkText(data);
        const active = rowById(activeUserRowId, "user");
        const canAppendToActive =
          Boolean(active) && (mid === undefined || userMsgKey === undefined || mid === userMsgKey);

        if (canAppendToActive && active) {
          active.text += piece;
          if (mid !== undefined && userMsgKey === undefined) userMsgKey = mid;
        } else {
          const nextRow = { type: "user" as const, id: ev.id, text: piece };
          pushRow(nextRow);
          activeUserRowId = nextRow.id;
          userMsgKey = mid;
        }
        break;
      }
      case "agent_thought_chunk": {
        flushPendingPrompt();
        if (!thinkingStartEventId) thinkingStartEventId = ev.id;
        const piece = extractChunkText(data);
        thinkingBuf += piece;
        break;
      }
      case "agent_message_chunk": {
        flushThinkingNow();
        flushPendingPrompt();
        const mid = chunkMessageId(data);
        const piece = extractChunkText(data);
        const active = rowById(activeAssistantRowId, "assistant");
        const canAppendToActive =
          Boolean(active) && (mid === undefined || assistantMsgKey === undefined || mid === assistantMsgKey);

        if (canAppendToActive && active) {
          active.text += piece;
          if (mid !== undefined && assistantMsgKey === undefined) assistantMsgKey = mid;
        } else {
          const nextRow = { type: "assistant" as const, id: ev.id, text: piece };
          pushRow(nextRow);
          activeAssistantRowId = nextRow.id;
          assistantMsgKey = mid;
        }
        break;
      }
      case "tool_call": {
        flushThinkingNow();
        flushPendingPrompt();
        breakAssistantRun();
        const toolCallId = typeof d.toolCallId === "string" ? d.toolCallId : ev.id;
        const row = ensureToolRow(rows, pushRow, toolIndex, toolCallId, { title: "Tool call" });
        mergeToolUpdate(row, d);
        break;
      }
      case "tool_call_update": {
        flushThinkingNow();
        flushPendingPrompt();
        breakAssistantRun();
        const toolCallId = typeof d.toolCallId === "string" ? d.toolCallId : "";
        if (!toolCallId) break;
        const row = ensureToolRow(rows, pushRow, toolIndex, toolCallId, { title: "Tool call" });
        mergeToolUpdate(row, d);
        break;
      }
      case "tool_call_content": {
        flushThinkingNow();
        flushPendingPrompt();
        breakAssistantRun();
        const toolCallId = typeof d.toolCallId === "string" ? d.toolCallId : "";
        if (!toolCallId) break;
        const row = ensureToolRow(rows, pushRow, toolIndex, toolCallId, { title: "Tool call" });
        if ("item" in d) row.contentItems.push(d.item);
        const urls = extractToolUrls(d);
        if (urls.length) {
          row.resultLinks = [...new Set([...(row.resultLinks ?? []), ...urls])];
        }
        break;
      }
      case "permission_request": {
        flushThinkingNow();
        breakAssistantRun();
        const norm = normalizePermission(data, ev.id);
        if (!norm) break;

        const tc = norm.toolCall && typeof norm.toolCall === "object" ? (norm.toolCall as Record<string, unknown>) : null;
        const toolCallId = tc && typeof tc.toolCallId === "string" ? tc.toolCallId : "";
        if (!toolCallId) {
          if (debugDetachedPermissions) pushRow({ type: "permission", id: norm.requestId, data: norm });
          break;
        }

        const existing = findBestToolRowForPermission(rows, toolCallId, tc);
        const row =
          existing ??
          ensureToolRow(rows, pushRow, toolIndex, toolCallId, { title: "Tool call" });
        if (tc) mergeToolUpdate(row, tc);
        row.permission = norm;
        break;
      }
      case "extension_request":
      case "extension_notification": {
        flushThinkingNow();
        breakAssistantRun();
        const sub = parseSubagentRow(ev, d);
        if (sub) {
          pushRow(sub);
          break;
        }
        const method = typeof d.method === "string" ? d.method : undefined;
        pushRow({
          type: "extension",
          id: ev.id,
          event: ev.event,
          method,
          data
        });
        break;
      }
      case "plan_update": {
        flushThinkingNow();
        breakAssistantRun();
        pushRow({ type: "plan", id: ev.id, data });
        break;
      }
      case "rpc_error": {
        flushThinkingNow();
        breakAssistantRun();
        pushRow({ type: "error", id: ev.id, data });
        break;
      }
      default:
        break;
    }

    if (ev.event === "prompt_completed") {
      flushThinkingNow();
      flushPendingPrompt();
      userMsgKey = undefined;
      assistantMsgKey = undefined;
      activeUserRowId = undefined;
      activeAssistantRowId = undefined;
    }
  }

  if (thinkingBuf.trim()) {
    pushRow({ type: "thinking", id: thinkingStartEventId || makeId(), text: thinkingBuf });
  }
  flushPendingPrompt();
  return foldExploreGroups(rows);
}
