import { existsSync, readdirSync, unlinkSync } from "node:fs";
import {
  NpcPersonaSchema,
  type RegionFlavor,
  RegionFlavorSchema,
  type StoryBible,
  StoryBibleSchema,
} from "../ai/schemas.js";
import type { DialogTurn, Npc } from "../game/npc.js";
import type { GameState } from "../game/state.js";
import { decodeTiles, encodeTiles } from "./codec.js";
import { type Db, openDb } from "./db.js";
import { savesDir, slotPath, slugify } from "./paths.js";

export interface SaveMeta {
  slug: string;
  name: string;
  seed: number;
  genre: string;
  createdAt: number;
  lastPlayedAt: number;
  playedMs: number;
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
      setMeta(db, "played_ms", "0");
      writeState(db, state);
    });
    tx();
    return {
      slug,
      name,
      seed,
      genre: state.genre,
      createdAt: now,
      lastPlayedAt: now,
      playedMs: 0,
    };
  } finally {
    db.close();
  }
}

export function saveSlot(slug: string, state: GameState): void {
  const p = slotPath(slug);
  if (!existsSync(p)) throw new Error(`Slot "${slug}" not found`);
  const db = openDb(p);
  try {
    const now = Date.now();
    const tx = db.transaction(() => {
      const prevLast = Number(readMetaValue(db, "last_played_at") ?? now);
      const prevPlayed = Number(readMetaValue(db, "played_ms") ?? 0);
      const delta = Math.max(0, now - prevLast);
      // cap a single save's contribution at 10 min to avoid huge bumps from idle gaps
      const capped = Math.min(delta, 10 * 60 * 1000);
      setMeta(db, "last_played_at", String(now));
      setMeta(db, "played_ms", String(prevPlayed + capped));
      setMeta(db, "genre", state.genre);
      writeState(db, state);
    });
    tx();
  } finally {
    db.close();
  }
}

function readMetaValue(db: Db, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
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
    genre: map.get("genre") ?? "dark fantasy",
    createdAt: Number(map.get("created_at") ?? 0),
    lastPlayedAt: Number(map.get("last_played_at") ?? 0),
    playedMs: Number(map.get("played_ms") ?? 0),
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

  writeNpcs(db, state.npcs);
  writeStory(db, state.bible, state.revealedBeats);
}

function writeStory(db: Db, bible: StoryBible | null, revealed: Set<string>): void {
  db.prepare("DELETE FROM story").run();
  if (bible) {
    db.prepare("INSERT INTO story (id, bible_json) VALUES (1, ?)").run(JSON.stringify(bible));
  }

  db.prepare("DELETE FROM beats_revealed").run();
  const insert = db.prepare("INSERT INTO beats_revealed (beat_id, revealed_at) VALUES (?, ?)");
  const now = Date.now();
  for (const id of revealed) insert.run(id, now);
}

function readStory(db: Db): { bible: StoryBible | null; revealed: Set<string> } {
  const row = db.prepare("SELECT bible_json FROM story WHERE id = 1").get() as
    | { bible_json: string }
    | undefined;

  let bible: StoryBible | null = null;
  if (row?.bible_json) {
    try {
      bible = StoryBibleSchema.parse(JSON.parse(row.bible_json));
    } catch {
      bible = null;
    }
  }

  const revealed = new Set<string>();
  const beatRows = db.prepare("SELECT beat_id FROM beats_revealed").all() as {
    beat_id: string;
  }[];
  for (const r of beatRows) revealed.add(r.beat_id);

  return { bible, revealed };
}

function writeNpcs(db: Db, npcs: Npc[]): void {
  db.prepare("DELETE FROM dialog_turns").run();
  db.prepare("DELETE FROM npcs").run();

  const insertNpc = db.prepare(
    `INSERT INTO npcs (id, region_id, x, y, persona_json, memory_summary)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertTurn = db.prepare(
    `INSERT INTO dialog_turns (npc_id, turn_idx, role, content, ts)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const npc of npcs) {
    insertNpc.run(
      npc.id,
      npc.regionId,
      npc.x,
      npc.y,
      JSON.stringify(npc.persona),
      npc.memorySummary,
    );
    npc.turns.forEach((turn, idx) => {
      insertTurn.run(npc.id, idx, turn.role, turn.content, turn.ts);
    });
  }
}

function readNpcs(db: Db, regionId: string): Npc[] {
  const rows = db
    .prepare(
      "SELECT id, region_id, x, y, persona_json, memory_summary FROM npcs WHERE region_id = ?",
    )
    .all(regionId) as {
    id: string;
    region_id: string;
    x: number;
    y: number;
    persona_json: string;
    memory_summary: string;
  }[];

  const npcs: Npc[] = [];
  const turnStmt = db.prepare(
    "SELECT role, content, ts FROM dialog_turns WHERE npc_id = ? ORDER BY turn_idx",
  );

  for (const row of rows) {
    let persona;
    try {
      persona = NpcPersonaSchema.parse(JSON.parse(row.persona_json));
    } catch {
      continue; // drop corrupted npc silently
    }
    const turnRows = turnStmt.all(row.id) as {
      role: string;
      content: string;
      ts: number;
    }[];
    const turns: DialogTurn[] = turnRows
      .filter((t) => t.role === "player" || t.role === "npc")
      .map((t) => ({
        role: t.role as "player" | "npc",
        content: t.content,
        ts: t.ts,
      }));
    npcs.push({
      id: row.id,
      regionId: row.region_id,
      x: row.x,
      y: row.y,
      persona,
      memorySummary: row.memory_summary,
      turns,
    });
  }
  return npcs;
}

function readState(db: Db): GameState {
  const player = db.prepare("SELECT region_id, x, y FROM player WHERE id = 1").get() as
    | { region_id: string; x: number; y: number }
    | undefined;
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
  const log = db.prepare("SELECT ts, text FROM log_entries ORDER BY idx").all() as {
    ts: number;
    text: string;
  }[];

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

  const npcs = readNpcs(db, region.id);
  const story = readStory(db);

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
    npcs,
    bible: story.bible,
    revealedBeats: story.revealed,
  };
}
