import Database from "better-sqlite3";

export type Db = Database.Database;

export interface Migration {
  version: number;
  description: string;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: "initial schema — meta, regions, player, log, schema_version",
    sql: `
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
  },
  {
    version: 2,
    description: "regions gain AI flavor_json column",
    sql: `
    ALTER TABLE regions ADD COLUMN flavor_json TEXT;
    `,
  },
  {
    version: 3,
    description: "NPCs and dialog turn history",
    sql: `
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
    `,
  },
  {
    version: 4,
    description: "story bible + revealed beats",
    sql: `
    CREATE TABLE IF NOT EXISTS story (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      bible_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beats_revealed (
      beat_id TEXT PRIMARY KEY,
      revealed_at INTEGER NOT NULL
    );
    `,
  },
  {
    version: 5,
    description: "log entry kind (for nudges)",
    sql: `
    ALTER TABLE log_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'note';
    `,
  },
  {
    version: 6,
    description: "items (on ground + in inventory)",
    sql: `
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      region_id TEXT,
      x INTEGER,
      y INTEGER,
      carried INTEGER NOT NULL DEFAULT 0,
      carried_idx INTEGER,
      shape_json TEXT NOT NULL,
      properties_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_items_region ON items(region_id);
    CREATE INDEX IF NOT EXISTS idx_items_carried ON items(carried, carried_idx);
    `,
  },
  {
    version: 7,
    description: "multi-region world: place_id, exits_json, visited",
    sql: `
    ALTER TABLE regions ADD COLUMN place_id TEXT;
    ALTER TABLE regions ADD COLUMN exits_json TEXT;
    ALTER TABLE regions ADD COLUMN visited INTEGER NOT NULL DEFAULT 0;
    `,
  },
];

export const TARGET_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export function currentVersion(db: Db): number {
  const tableRow = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get() as { name?: string } | undefined;
  if (!tableRow?.name) return 0;
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version?: number }
    | undefined;
  return row?.version ?? 0;
}

export function pendingMigrations(db: Db): Migration[] {
  const from = currentVersion(db);
  return MIGRATIONS.filter((m) => m.version > from);
}

export function listMigrations(): readonly Migration[] {
  return MIGRATIONS;
}

export function applyMigration(db: Db, migration: Migration): void {
  const tx = db.transaction(() => {
    db.exec(migration.sql);
    db.prepare("DELETE FROM schema_version").run();
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(migration.version);
  });
  tx();
}

export function dryRunMigration(
  db: Db,
  migration: Migration,
): { ok: true } | { ok: false; error: string } {
  try {
    db.exec("BEGIN");
    db.exec(migration.sql);
    db.exec("ROLLBACK");
    return { ok: true };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    return { ok: false, error: (err as Error).message };
  }
}

export function openDb(filePath: string): Db {
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  for (const migration of pendingMigrations(db)) {
    applyMigration(db, migration);
  }
  return db;
}
