import Database from "better-sqlite3";

export type Db = Database.Database;

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    spawn_x INTEGER NOT NULL,
    spawn_y INTEGER NOT NULL,
    tiles BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    region_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS log_entries (
    idx INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );

  INSERT OR IGNORE INTO schema_version (version) VALUES (1);
  `,

  // v2 — regions gain AI flavor
  `
  ALTER TABLE regions ADD COLUMN flavor_json TEXT;

  DELETE FROM schema_version;
  INSERT INTO schema_version (version) VALUES (2);
  `,

  // v3 — NPCs and dialog history
  `
  CREATE TABLE IF NOT EXISTS npcs (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    persona_json TEXT NOT NULL,
    memory_summary TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_npcs_region ON npcs(region_id);

  CREATE TABLE IF NOT EXISTS dialog_turns (
    npc_id TEXT NOT NULL,
    turn_idx INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    ts INTEGER NOT NULL,
    PRIMARY KEY (npc_id, turn_idx)
  );

  DELETE FROM schema_version;
  INSERT INTO schema_version (version) VALUES (3);
  `,

  // v4 — story bible and revealed beats
  `
  CREATE TABLE IF NOT EXISTS story (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    bible_json TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS beats_revealed (
    beat_id TEXT PRIMARY KEY,
    revealed_at INTEGER NOT NULL
  );

  DELETE FROM schema_version;
  INSERT INTO schema_version (version) VALUES (4);
  `,
];

function currentVersion(db: Db): number {
  const tableRow = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get() as { name?: string } | undefined;
  if (!tableRow?.name) return 0;
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version?: number }
    | undefined;
  return row?.version ?? 0;
}

export function openDb(filePath: string): Db {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const from = currentVersion(db);
  for (let i = from; i < MIGRATIONS.length; i++) {
    const sql = MIGRATIONS[i];
    if (sql) db.exec(sql);
  }
  return db;
}
