const path = require("node:path");
const Database = require("better-sqlite3");

const dbPath =
  process.env.BASIS_DB_PATH ||
  path.join(process.env.APPDATA || "", "basis", "basis-chat.db");

const db = new Database(dbPath, { readonly: true });

const rows = db
  .prepare(
    `
    select
      seq,
      at,
      space_slug as spaceSlug,
      thread_id as threadId,
      session_id as sessionId,
      data_json as dataJson
    from acp_events
    where event = 'usage_update'
    order by seq desc
    limit 25
    `,
  )
  .all();

const parsed = rows.map((r) => {
  let data = null;
  try {
    data = r.dataJson ? JSON.parse(r.dataJson) : null;
  } catch {
    data = { _parseError: true, raw: r.dataJson };
  }
  return {
    seq: r.seq,
    at: r.at,
    spaceSlug: r.spaceSlug,
    threadId: r.threadId,
    sessionId: r.sessionId,
    sessionUpdate: data && typeof data === "object" ? data.sessionUpdate : undefined,
    keys: data && typeof data === "object" ? Object.keys(data) : [],
    data,
  };
});

console.log(JSON.stringify({ dbPath, count: parsed.length, rows: parsed }, null, 2));

