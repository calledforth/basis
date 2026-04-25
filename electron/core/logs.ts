import { nowIso, type LogEntry } from "./types.js";

const MAX_LOGS = 1500;

let publishLogEntry: ((entry: LogEntry) => void) | null = null;
const logs: LogEntry[] = [];

export function setLogPublisher(publisher: ((entry: LogEntry) => void) | null) {
  publishLogEntry = publisher;
}

export function addLog(entry: Omit<LogEntry, "id" | "at">) {
  const full: LogEntry = {
    id: crypto.randomUUID(),
    at: nowIso(),
    ...entry
  };
  logs.unshift(full);
  if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
  publishLogEntry?.(full);
}

export function listLogs(): LogEntry[] {
  return logs;
}

export function clearLogs() {
  logs.length = 0;
}
