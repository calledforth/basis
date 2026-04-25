import Database from "better-sqlite3";
import { nowIso, type AcpEventEntry, type ThreadBackend, type ThreadRecord } from "./types.js";

type ThreadRow = {
  thread_id: string;
  space_slug: string;
  backend: ThreadBackend;
  backend_session_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_preview: string | null;
  status: ThreadRecord["status"];
};

type EventRow = {
  id: string;
  at: string;
  seq: number | null;
  space_slug: string;
  thread_id: string;
  category: AcpEventEntry["category"];
  event: AcpEventEntry["event"];
  session_id: string | null;
  data_json: string | null;
};

function rowToThread(row: ThreadRow): ThreadRecord {
  return {
    threadId: row.thread_id,
    spaceSlug: row.space_slug,
    backend: row.backend,
    backendSessionId: row.backend_session_id ?? undefined,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessagePreview: row.last_message_preview ?? undefined,
    status: row.status
  };
}

function rowToEvent(row: EventRow): AcpEventEntry {
  return {
    id: row.id,
    at: row.at,
    seq: row.seq ?? 0,
    spaceSlug: row.space_slug,
    threadId: row.thread_id,
    category: row.category,
    event: row.event,
    sessionId: row.session_id ?? undefined,
    data: row.data_json ? safeParseJson(row.data_json) : undefined
  };
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

export type AcpEventInsert = Omit<AcpEventEntry, "seq">;

export class ChatDb {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS threads (
        thread_id TEXT PRIMARY KEY,
        space_slug TEXT NOT NULL,
        backend TEXT NOT NULL,
        backend_session_id TEXT,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_preview TEXT,
        status TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS acp_events (
        id TEXT PRIMARY KEY,
        at TEXT NOT NULL,
        space_slug TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        category TEXT NOT NULL,
        event TEXT NOT NULL,
        session_id TEXT,
        data_json TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_threads_space_updated
      ON threads (space_slug, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_events_thread_time
      ON acp_events (space_slug, thread_id, at, id);
    `);

    this.db
      .prepare(
        `
        INSERT INTO meta (key, value)
        VALUES ('schema_version', '1')
        ON CONFLICT(key) DO NOTHING
        `
      )
      .run();

    this.runSchemaMigrations();
  }

  private getMetaValue(key: string): string | undefined {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value;
  }

  private setMetaValue(key: string, value: string) {
    this.db.prepare(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
  }

  private runSchemaMigrations() {
    const version = Number(this.getMetaValue("schema_version") ?? "1");
    const hasSeq = tableHasColumn(this.db, "acp_events", "seq");
    const hasBackend = tableHasColumn(this.db, "threads", "backend");

    if (version < 2 || !hasSeq) {
      if (!hasSeq) {
        this.db.exec(`ALTER TABLE acp_events ADD COLUMN seq INTEGER`);
      }

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS thread_event_seq (
          space_slug TEXT NOT NULL,
          thread_id TEXT NOT NULL,
          next_seq INTEGER NOT NULL,
          PRIMARY KEY (space_slug, thread_id)
        );
      `);

      this.db.exec(`
        UPDATE acp_events
        SET seq = (
          SELECT ordered.rn
          FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (PARTITION BY space_slug, thread_id ORDER BY at ASC, id ASC) AS rn
            FROM acp_events
          ) AS ordered
          WHERE ordered.id = acp_events.id
        )
        WHERE seq IS NULL;
      `);

      this.db.exec(`
        INSERT INTO thread_event_seq (space_slug, thread_id, next_seq)
        SELECT space_slug, thread_id, COALESCE(MAX(seq), 0)
        FROM acp_events
        GROUP BY space_slug, thread_id
        ON CONFLICT(space_slug, thread_id) DO UPDATE SET
          next_seq = MAX(thread_event_seq.next_seq, excluded.next_seq);
      `);

      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_thread_seq
        ON acp_events (space_slug, thread_id, seq);
      `);
    }

    if (version < 3 || !hasBackend) {
      if (!hasBackend) {
        this.db.exec(`ALTER TABLE threads ADD COLUMN backend TEXT`);
      }
      this.db.exec(`
        UPDATE threads
        SET backend = 'cursor'
        WHERE backend IS NULL OR TRIM(backend) = '';
      `);
    }

    this.setMetaValue("schema_version", "3");
  }

  private allocateNextSeq(spaceSlug: string, threadId: string): number {
    this.db
      .prepare(
        `
        INSERT INTO thread_event_seq (space_slug, thread_id, next_seq)
        VALUES (?, ?, 0)
        ON CONFLICT(space_slug, thread_id) DO NOTHING
        `
      )
      .run(spaceSlug, threadId);

    const row = this.db
      .prepare(
        `
        UPDATE thread_event_seq
        SET next_seq = next_seq + 1
        WHERE space_slug = ? AND thread_id = ?
        RETURNING next_seq
        `
      )
      .get(spaceSlug, threadId) as { next_seq: number } | undefined;

    if (!row) throw new Error("thread_event_seq row missing after allocate");
    return row.next_seq;
  }

  listThreads(spaceSlug: string): ThreadRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT thread_id, space_slug, backend, backend_session_id, title, created_at, updated_at, last_message_preview, status
        FROM threads
        WHERE space_slug = ?
        ORDER BY updated_at DESC, thread_id DESC
        `
      )
      .all(spaceSlug) as ThreadRow[];
    return rows.map(rowToThread);
  }

  getThread(spaceSlug: string, threadId: string): ThreadRecord | undefined {
    const row = this.db
      .prepare(
        `
        SELECT thread_id, space_slug, backend, backend_session_id, title, created_at, updated_at, last_message_preview, status
        FROM threads
        WHERE space_slug = ? AND thread_id = ?
        `
      )
      .get(spaceSlug, threadId) as ThreadRow | undefined;
    return row ? rowToThread(row) : undefined;
  }

  createThread(spaceSlug: string, title?: string, backend: ThreadBackend = "cursor"): ThreadRecord {
    const record: ThreadRecord = {
      threadId: crypto.randomUUID(),
      spaceSlug,
      backend,
      title: title ?? "New Chat",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: "creating"
    };
    this.db
      .prepare(
        `
        INSERT INTO threads (
          thread_id, space_slug, backend, backend_session_id, title, created_at, updated_at, last_message_preview, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        record.threadId,
        record.spaceSlug,
        record.backend,
        record.backendSessionId ?? null,
        record.title,
        record.createdAt,
        record.updatedAt,
        record.lastMessagePreview ?? null,
        record.status
      );
    return record;
  }

  updateThread(spaceSlug: string, threadId: string, patch: Partial<ThreadRecord>): boolean {
    const current = this.getThread(spaceSlug, threadId);
    if (!current) return false;

    const next: ThreadRecord = {
      ...current,
      ...patch,
      updatedAt: nowIso()
    };

    this.db
      .prepare(
        `
        UPDATE threads
        SET backend = ?,
            backend_session_id = ?,
            title = ?,
            updated_at = ?,
            last_message_preview = ?,
            status = ?
        WHERE thread_id = ? AND space_slug = ?
        `
      )
      .run(
        next.backend,
        next.backendSessionId ?? null,
        next.title,
        next.updatedAt,
        next.lastMessagePreview ?? null,
        next.status,
        threadId,
        spaceSlug
      );

    return true;
  }

  insertAcpEvent(entry: AcpEventInsert): AcpEventEntry {
    return this.db.transaction(() => {
      const seq = this.allocateNextSeq(entry.spaceSlug, entry.threadId);
      const full: AcpEventEntry = { ...entry, seq };
      this.db
        .prepare(
          `
          INSERT OR IGNORE INTO acp_events (
            id, at, seq, space_slug, thread_id, category, event, session_id, data_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
        )
        .run(
          full.id,
          full.at,
          full.seq,
          full.spaceSlug,
          full.threadId,
          full.category,
          full.event,
          full.sessionId ?? null,
          full.data === undefined ? null : JSON.stringify(full.data)
        );
      return full;
    })();
  }

  listAcpEvents(spaceSlug: string, threadId: string): AcpEventEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, at, seq, space_slug, thread_id, category, event, session_id, data_json
        FROM acp_events
        WHERE space_slug = ? AND thread_id = ?
        ORDER BY seq ASC, at ASC, id ASC
        `
      )
      .all(spaceSlug, threadId) as EventRow[];
    return rows.map(rowToEvent);
  }

  close() {
    this.db.close();
  }
}
