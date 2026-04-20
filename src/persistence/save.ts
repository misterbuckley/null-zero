import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { type RegionFlavor, RegionFlavorSchema } from "../ai/schemas.js";
import type { GameState } from "../game/state.js";
import { decodeTiles, encodeTiles } from "./codec.js";
import { type Db, openDb } from "./db.js";
import { savesDir, slotPath, slugify } from "./paths.js";

export interface SaveMeta {
  slug: string;
  name: string;
  seed: number;
  createdAt: number;
  lastPlayedAt: number;
}

export function listSaves(): SaveMeta[] {
  const dir = savesDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".db"));
  const saves: SaveMeta[] = [];
  for (const file of files) {
    const slug = file.replace(/\.db$/, "");
    try {
      const meta = readMeta(slug);
      if (meta) saves.push(meta);
    } catch {
      // skip corrupted saves
    }
  }
  saves.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
  return saves;
}

export function readMeta(slug: string): SaveMeta | null {
  const p = slotPath(slug);
  if (!existsSync(p)) return null;
  const db = openDb(p);
  try {
    return getMeta(db, slug);
  } finally {
    db.close();
  }
}

export function slotExists(name: string): boolean {
  return existsSync(slotPath(slugify(name)));
}

export function createSlot(name: string, seed: number, state: GameState): SaveMeta {
  const slug = slugify(name);
  const p = slotPath(slug);
  if (existsSync(p)) throw new Error(`Slot "${slug}" already exists`);
  const db = openDb(p);
  try {
    const now = Date.now();
    const tx = db.transaction(() => {
      setMeta(db, "name", name);
      setMeta(db, "seed", String(seed));
      setMeta(db, "genre", state.genre);
      setMeta(db, "created_at", String(now));
      setMeta(db, "last_played_at", String(now));
      writeState(db, state);
    });
    tx();
    return { slug, name, seed, createdAt: now, lastPlayedAt: now };
  } finally {
    db.close();
  }
}

export function saveSlot(slug: string, state: GameState): void {
  const p = slotPath(slug);
  if (!existsSync(p)) throw new Error(`Slot "${slug}" not found`);
  const db = openDb(p);
  try {
    const tx = db.transaction(() => {
      setMeta(db, "last_played_at", String(Date.now()));
      setMeta(db, "genre", state.genre);
      writeState(db, state);
    });
    tx();
  } finally {
    db.close();
  }
}

export function loadSlot(slug: string): { meta: SaveMeta; state: GameState } {
  const p = slotPath(slug);
  if (!existsSync(p)) throw new Error(`Slot "${slug}" not found`);
  const db = openDb(p);
  try {
    const meta = getMeta(db, slug);
    const state = readState(db);
    return { meta, state };
  } finally {
    db.close();
  }
}

export function deleteSlot(slug: string): void {
  const p = slotPath(slug);
  if (!existsSync(p)) return;
  unlinkSync(p);
  for (const suffix of ["-wal", "-shm"]) {
    const extra = p + suffix;
    if (existsSync(extra)) unlinkSync(extra);
  }
}

function getMeta(db: Db, slug: string): SaveMeta {
  const rows = db.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    slug,
    name: map.get("name") ?? slug,
    seed: Number(map.get("seed") ?? 0),
    createdAt: Number(map.get("created_at") ?? 0),
    lastPlayedAt: Number(map.get("last_played_at") ?? 0),
  };
}

function setMeta(db: Db, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

function writeState(db: Db, state: GameState): void {
  const region = state.region;
  db.prepare(
    `INSERT INTO regions (id, width, height, spawn_x, spawn_y, tiles, flavor_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       width = excluded.width,
       height = excluded.height,
       spawn_x = excluded.spawn_x,
       spawn_y = excluded.spawn_y,
       tiles = excluded.tiles,
       flavor_json = excluded.flavor_json`,
  ).run(
    region.id,
    region.width,
    region.height,
    region.spawn.x,
    region.spawn.y,
    encodeTiles(region.tiles),
    region.flavor ? JSON.stringify(region.flavor) : null,
  );

  db.prepare(
    `INSERT INTO player (id, region_id, x, y) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       region_id = excluded.region_id,
       x = excluded.x,
       y = excluded.y`,
  ).run(region.id, state.player.x, state.player.y);

  db.prepare("DELETE FROM log_entries").run();
  const insertLog = db.prepare("INSERT INTO log_entries (ts, text) VALUES (?, ?)");
  for (const entry of state.log) insertLog.run(entry.ts, entry.text);
}

function readState(db: Db): GameState {
  const player = db
    .prepare("SELECT region_id, x, y FROM player WHERE id = 1")
    .get() as { region_id: string; x: number; y: number } | undefined;
  if (!player) throw new Error("no player record in save");

  const region = db
    .prepare(
      "SELECT id, width, height, spawn_x, spawn_y, tiles, flavor_json FROM regions WHERE id = ?",
    )
    .get(player.region_id) as
    | {
        id: string;
        width: number;
        height: number;
        spawn_x: number;
        spawn_y: number;
        tiles: Buffer;
        flavor_json: string | null;
      }
    | undefined;
  if (!region) throw new Error(`region ${player.region_id} not found`);

  const tiles = decodeTiles(region.tiles, region.width * region.height);
  const log = db
    .prepare("SELECT ts, text FROM log_entries ORDER BY idx")
    .all() as { ts: number; text: string }[];

  const metaRows = db.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  const metaMap = new Map(metaRows.map((r) => [r.key, r.value]));
  const genre = metaMap.get("genre") ?? "dark fantasy";

  let flavor: RegionFlavor | undefined;
  if (region.flavor_json) {
    try {
      flavor = RegionFlavorSchema.parse(JSON.parse(region.flavor_json));
    } catch {
      // if stored flavor fails validation, drop it silently
    }
  }

  return {
    genre,
    region: {
      id: region.id,
      width: region.width,
      height: region.height,
      spawn: { x: region.spawn_x, y: region.spawn_y },
      tiles,
      flavor,
    },
    player: { x: player.x, y: player.y },
    log,
  };
}
