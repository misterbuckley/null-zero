import { fallbackBible, generateBible } from "../ai/bible.js";
import { fallbackFlavor, generateFlavor } from "../ai/flavor.js";
import type { Gateway } from "../ai/gateway.js";
import { fallbackItems, generateItems } from "../ai/items.js";
import { fallbackPersona, generatePersona } from "../ai/persona.js";
import type { ItemShape, NpcPersona, RegionFlavor, StoryBible } from "../ai/schemas.js";
import { generateCave } from "../world/generator/cave.js";
import { type Region, type RegionExit, setTile, tileAt } from "../world/region.js";
import { type RNG, mulberry32, randInt } from "../world/rng.js";
import { makeExit } from "../world/tile.js";
import { type Item, dropAt } from "./item.js";
import type { Npc } from "./npc.js";
import type { GameState } from "./state.js";

const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface NewGameOptions {
  seed: number;
  genre: string;
  gateway: Gateway | null;
}

export async function newGame(opts: NewGameOptions): Promise<GameState> {
  const rng = mulberry32(opts.seed);

  const bible = opts.gateway
    ? await safeGenerateBible(opts.gateway, opts.genre)
    : fallbackBible(opts.genre);

  const startPlace = bible.places[0];
  const biome = startPlace?.biome ?? "cave";
  const region = generateCave(`r-${startPlace?.id ?? "p01"}-${opts.seed.toString(16)}`, rng, {
    width: 90,
    height: 46,
  });
  if (startPlace) region.placeId = startPlace.id;

  const flavor = opts.gateway
    ? await safeGenerateFlavor(opts.gateway, opts.genre, biome)
    : fallbackFlavor(opts.genre, biome);
  region.flavor = startPlace ? { ...flavor, name: startPlace.name } : flavor;

  // Wire exits toward 1–2 other places from the catalog.
  placeInitialExits(region, bible, rng);

  const npcs = await placeNpcs(region, rng, opts.genre, region.flavor, opts.gateway);
  const items = await placeItems(
    region,
    rng,
    opts.genre,
    region.flavor,
    npcs[0] ?? null,
    opts.gateway,
  );

  const now = Date.now();
  const log = [
    { ts: now, text: `You come to yourself in ${region.flavor.name}.`, kind: "note" as const },
    { ts: now, text: region.flavor.description, kind: "note" as const },
    {
      ts: now,
      text:
        npcs.length > 0
          ? "You are not alone here. Press t beside them to speak."
          : "Move with hjkl or arrows. S to save · Q for menu.",
      kind: "note" as const,
    },
  ];

  return {
    genre: opts.genre,
    region,
    regions: { [region.id]: region },
    visitedRegionIds: new Set<string>([region.id]),
    player: { x: region.spawn.x, y: region.spawn.y },
    log,
    npcs,
    items,
    bible,
    revealedBeats: new Set<string>(),
    lastRevealAt: now,
  };
}

function placeInitialExits(region: Region, bible: StoryBible, rng: RNG): void {
  const startPlaceId = region.placeId;
  if (!startPlaceId) return;
  const others = bible.places.filter((p) => p.id !== startPlaceId);
  const picks = shuffled(others, rng).slice(0, Math.min(2, others.length));
  region.exits = [];
  const used = new Set<string>();
  let idx = 0;
  for (const place of picks) {
    const spot = pickExitSpot(region, rng, used);
    if (!spot) continue;
    used.add(`${spot.x},${spot.y}`);
    const exitId = `e-${region.id}-${idx++}`;
    setTile(region, spot.x, spot.y, makeExit(exitId));
    const lock = (bible.locked_paths ?? []).find((l) => l.to_place_id === place.id);
    const exit: RegionExit = {
      id: exitId,
      x: spot.x,
      y: spot.y,
      toPlaceId: place.id,
      toRegionId: null,
      label: `→ ${place.name}`,
      lockTag: lock?.lock_tag,
      lockHint: lock?.hint,
    };
    region.exits.push(exit);
  }
}

function pickExitSpot(
  region: Region,
  rng: RNG,
  excluded: Set<string>,
): { x: number; y: number } | null {
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 2; y < region.height - 2; y++) {
    for (let x = 2; x < region.width - 2; x++) {
      const t = tileAt(region, x, y);
      if (t?.kind !== "floor") continue;
      if (excluded.has(`${x},${y}`)) continue;
      const dxEdge = Math.min(x, region.width - 1 - x);
      const dyEdge = Math.min(y, region.height - 1 - y);
      const edgeDist = Math.min(dxEdge, dyEdge);
      if (edgeDist > 6) continue;
      let floorNeighbors = 0;
      for (const [dx, dy] of NEIGHBORS) {
        const n = tileAt(region, x + dx, y + dy);
        if (n?.kind === "floor") floorNeighbors++;
      }
      if (floorNeighbors === 0) continue;
      const dsx = x - region.spawn.x;
      const dsy = y - region.spawn.y;
      const dSpawn = Math.hypot(dsx, dsy);
      if (dSpawn < 10) continue;
      candidates.push({ x, y, score: -edgeDist + dSpawn * 0.1 });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, Math.min(12, candidates.length));
  return top[randInt(rng, 0, top.length)] ?? null;
}

function shuffled<T>(arr: T[], rng: RNG): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

async function safeGenerateBible(gateway: Gateway, genre: string): Promise<StoryBible> {
  try {
    return await generateBible(gateway, { genre });
  } catch {
    return fallbackBible(genre);
  }
}

async function safeGenerateFlavor(gateway: Gateway, genre: string, biome: string) {
  try {
    return await generateFlavor(gateway, { genre, biome });
  } catch {
    return fallbackFlavor(genre, biome);
  }
}

async function placeNpcs(
  region: Region,
  rng: RNG,
  genre: string,
  flavor: RegionFlavor,
  gateway: Gateway | null,
): Promise<Npc[]> {
  const pos = pickFloorAwayFromSpawn(region, rng);
  if (!pos) return [];

  const persona = await safeGeneratePersona(gateway, genre, flavor);
  const npc: Npc = {
    id: `npc-${region.id}-0`,
    regionId: region.id,
    x: pos.x,
    y: pos.y,
    persona,
    memorySummary: "",
    turns: [],
  };
  return [npc];
}

async function safeGeneratePersona(
  gateway: Gateway | null,
  genre: string,
  region: RegionFlavor,
): Promise<NpcPersona> {
  if (!gateway) return fallbackPersona(genre);
  try {
    return await generatePersona(gateway, { genre, region });
  } catch {
    return fallbackPersona(genre);
  }
}

async function placeItems(
  region: Region,
  rng: RNG,
  genre: string,
  flavor: RegionFlavor,
  npc: Npc | null,
  gateway: Gateway | null,
): Promise<Item[]> {
  const shapes = await safeGenerateItems(gateway, genre, flavor, npc?.persona ?? null);
  const taken = new Set<string>();
  taken.add(`${region.spawn.x},${region.spawn.y}`);
  if (npc) taken.add(`${npc.x},${npc.y}`);

  const items: Item[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (!shape) continue;
    const pos = pickFloorAwayFromSpawn(region, rng, taken);
    if (!pos) break;
    taken.add(`${pos.x},${pos.y}`);
    const item: Item = {
      id: `item-${region.id}-${i}`,
      regionId: null,
      x: null,
      y: null,
      shape,
      properties: {},
    };
    dropAt(item, region.id, pos.x, pos.y);
    items.push(item);
  }
  return items;
}

async function safeGenerateItems(
  gateway: Gateway | null,
  genre: string,
  region: RegionFlavor,
  persona: NpcPersona | null,
): Promise<ItemShape[]> {
  if (!gateway) return fallbackItems(genre);
  try {
    return await generateItems(gateway, { genre, region, npc: persona });
  } catch {
    return fallbackItems(genre);
  }
}

function pickFloorAwayFromSpawn(
  region: Region,
  rng: RNG,
  excluded: Set<string> = new Set(),
): { x: number; y: number } | null {
  const candidates: { x: number; y: number }[] = [];
  const { spawn } = region;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const t = tileAt(region, x, y);
      if (t?.kind !== "floor") continue;
      if (excluded.has(`${x},${y}`)) continue;
      const dx = x - spawn.x;
      const dy = y - spawn.y;
      if (dx * dx + dy * dy < 8 * 8) continue;
      candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[randInt(rng, 0, candidates.length)] ?? null;
}
