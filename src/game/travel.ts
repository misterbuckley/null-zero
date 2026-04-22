import { fallbackFlavor, generateFlavor } from "../ai/flavor.js";
import type { Gateway } from "../ai/gateway.js";
import { fallbackItems, generateItems } from "../ai/items.js";
import { fallbackPersona, generatePersona } from "../ai/persona.js";
import type { ItemShape, NpcPersona, Place, RegionFlavor } from "../ai/schemas.js";
import { generateCave } from "../world/generator/cave.js";
import { type Region, type RegionExit, setTile, tileAt } from "../world/region.js";
import { type RNG, mulberry32, randInt } from "../world/rng.js";
import { makeExit } from "../world/tile.js";
import { type Item, dropAt } from "./item.js";
import type { Npc } from "./npc.js";
import { type GameState, pushLog, switchRegion } from "./state.js";

const NEIGHBORS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const REGION_W = 90;
const REGION_H = 46;

export interface TravelResult {
  added: Region;
  npcsAdded: Npc[];
  itemsAdded: Item[];
}

export async function travelThroughExit(
  state: GameState,
  exit: RegionExit,
  gateway: Gateway | null,
): Promise<void> {
  const fromRegion = state.region;
  if (exit.toRegionId) {
    const existing = state.regions[exit.toRegionId];
    if (existing) {
      enterExistingRegion(state, exit, existing);
      prefetchAdjacentFlavor(state, gateway);
      return;
    }
  }

  const places = state.bible?.places ?? [];
  const place = places.find((p) => p.id === exit.toPlaceId) ?? null;
  const result = await generateRegionForPlace({
    state,
    place,
    placeId: exit.toPlaceId,
    gateway,
    fromRegion,
    incomingExitPos: { x: exit.x, y: exit.y },
  });

  // Bind this exit to the new region (placeExits already bound the return side).
  exit.toRegionId = result.added.id;

  state.regions[result.added.id] = result.added;
  for (const npc of result.npcsAdded) state.npcs.push(npc);
  for (const item of result.itemsAdded) state.items.push(item);

  enterRegionAtExit(state, result.added, exit.toPlaceId, fromRegion.id);
  prefetchAdjacentFlavor(state, gateway);
}

export function prefetchAdjacentFlavor(state: GameState, gateway: Gateway | null): void {
  if (!gateway) return;
  if (!state.region.exits) return;
  state.flavorPrefetch ??= {};
  const cache = state.flavorPrefetch;
  for (const exit of state.region.exits) {
    const placeId = exit.toPlaceId;
    if (cache[placeId]) continue;
    if (exit.toRegionId && state.regions[exit.toRegionId]?.flavor) continue;
    const place = state.bible?.places.find((p) => p.id === placeId);
    const biome = place?.biome ?? "cave";
    const adjacentSummaries = state.region.flavor
      ? [`${state.region.flavor.name}: ${state.region.flavor.description}`]
      : undefined;
    generateFlavor(gateway, { genre: state.genre, biome, adjacentSummaries })
      .then((flavor) => {
        cache[placeId] = flavor;
      })
      .catch(() => {
        // best-effort
      });
  }
}

function enterExistingRegion(state: GameState, exit: RegionExit, destination: Region): void {
  // Enter at the exit that leads back to where we came from, if one exists.
  const back = destination.exits?.find((e) => e.toRegionId === state.region.id);
  const landing = back
    ? (pickAdjacentFloor(destination, back.x, back.y) ?? { x: back.x, y: back.y })
    : { x: destination.spawn.x, y: destination.spawn.y };
  const fromId = state.region.id;
  switchRegion(state, destination);
  state.player.x = landing.x;
  state.player.y = landing.y;
  if (destination.flavor) {
    pushLog(state, `You pass into ${destination.flavor.name}.`);
  } else {
    pushLog(state, "You pass into somewhere new.");
  }
  // discourage an unused-variable warning in strict builds
  void fromId;
  void exit;
}

function enterRegionAtExit(
  state: GameState,
  destination: Region,
  _placeId: string,
  fromRegionId: string,
): void {
  const back = destination.exits?.find((e) => e.toRegionId === fromRegionId);
  const landing = back
    ? (pickAdjacentFloor(destination, back.x, back.y) ?? { x: back.x, y: back.y })
    : { x: destination.spawn.x, y: destination.spawn.y };
  switchRegion(state, destination);
  state.player.x = landing.x;
  state.player.y = landing.y;
  if (destination.flavor) {
    pushLog(state, `You cross into ${destination.flavor.name}.`);
    pushLog(state, destination.flavor.description);
  }
}

interface GenerateArgs {
  state: GameState;
  place: Place | null;
  placeId: string;
  gateway: Gateway | null;
  fromRegion: Region;
  incomingExitPos: { x: number; y: number };
}

async function generateRegionForPlace(args: GenerateArgs): Promise<TravelResult> {
  const { state, place, placeId, gateway, fromRegion } = args;
  const seed = hashString(`${fromRegion.id}->${placeId}-${Date.now() & 0xffff}`);
  const rng = mulberry32(seed);
  const id = `r-${placeId}-${seed.toString(16)}`;

  const biome = place?.biome ?? "cave";
  const region = generateCave(id, rng, { width: REGION_W, height: REGION_H });
  region.placeId = placeId;

  // Flavor: prefer prefetched flavor, else AI, else fallback.
  let flavor = state.flavorPrefetch?.[placeId];
  if (!flavor) {
    const adjacentSummaries = fromRegion.flavor
      ? [`${fromRegion.flavor.name}: ${fromRegion.flavor.description}`]
      : undefined;
    flavor = await safeGenerateFlavor(gateway, state.genre, biome, adjacentSummaries);
  }
  region.flavor = place ? { ...flavor, name: place.name } : flavor;

  // Place exits back toward the source + outward toward 1 more place.
  placeExits(region, state, placeId, rng);

  const npcs = await placeNpc(region, rng, state.genre, region.flavor, gateway);
  const items = await placeItems(region, rng, state.genre, region.flavor, npcs[0] ?? null, gateway);

  return { added: region, npcsAdded: npcs, itemsAdded: items };
}

function placeExits(region: Region, state: GameState, placeId: string, rng: RNG): void {
  const places = state.bible?.places ?? [];
  const previousPlace = state.region.placeId;
  const neighborPlaceIds: string[] = [];
  if (previousPlace && previousPlace !== placeId) neighborPlaceIds.push(previousPlace);
  const candidates = places.filter((p) => p.id !== placeId && p.id !== previousPlace);
  for (const c of shuffled(candidates, rng)) {
    neighborPlaceIds.push(c.id);
    if (neighborPlaceIds.length >= 2) break;
  }

  region.exits = [];
  const used = new Set<string>();
  let exitIdx = 0;
  for (const toPlaceId of neighborPlaceIds) {
    const spot = pickExitSpot(region, rng, used);
    if (!spot) continue;
    used.add(`${spot.x},${spot.y}`);
    const exitId = `e-${region.id}-${exitIdx++}`;
    setTile(region, spot.x, spot.y, makeExit(exitId));
    const destPlace = state.bible?.places.find((p) => p.id === toPlaceId);
    region.exits.push({
      id: exitId,
      x: spot.x,
      y: spot.y,
      toPlaceId,
      toRegionId: toPlaceId === previousPlace ? state.region.id : null,
      label: destPlace ? `→ ${destPlace.name}` : "→ somewhere",
    });
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
      // Prefer tiles near the border.
      const dxEdge = Math.min(x, region.width - 1 - x);
      const dyEdge = Math.min(y, region.height - 1 - y);
      const edgeDist = Math.min(dxEdge, dyEdge);
      if (edgeDist > 6) continue;
      // Must have at least one floor neighbor so the player can stand next to it.
      let floorNeighbors = 0;
      for (const [dx, dy] of NEIGHBORS) {
        const n = tileAt(region, x + dx, y + dy);
        if (n?.kind === "floor") floorNeighbors++;
      }
      if (floorNeighbors === 0) continue;
      // Keep distance from spawn so the first thing the player sees isn't an exit.
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

function pickAdjacentFloor(region: Region, x: number, y: number): { x: number; y: number } | null {
  for (const [dx, dy] of NEIGHBORS) {
    const t = tileAt(region, x + dx, y + dy);
    if (t?.kind === "floor") return { x: x + dx, y: y + dy };
  }
  return null;
}

async function safeGenerateFlavor(
  gateway: Gateway | null,
  genre: string,
  biome: string,
  adjacentSummaries?: string[],
): Promise<RegionFlavor> {
  if (!gateway) return fallbackFlavor(genre, biome);
  try {
    return await generateFlavor(gateway, { genre, biome, adjacentSummaries });
  } catch {
    return fallbackFlavor(genre, biome);
  }
}

async function placeNpc(
  region: Region,
  rng: RNG,
  genre: string,
  flavor: RegionFlavor,
  gateway: Gateway | null,
): Promise<Npc[]> {
  const spot = pickInteriorFloor(region, rng);
  if (!spot) return [];
  let persona: NpcPersona;
  if (gateway) {
    try {
      persona = await generatePersona(gateway, { genre, region: flavor });
    } catch {
      persona = fallbackPersona(genre);
    }
  } else {
    persona = fallbackPersona(genre);
  }
  return [
    {
      id: `npc-${region.id}-0`,
      regionId: region.id,
      x: spot.x,
      y: spot.y,
      persona,
      memorySummary: "",
      turns: [],
    },
  ];
}

async function placeItems(
  region: Region,
  rng: RNG,
  genre: string,
  flavor: RegionFlavor,
  npc: Npc | null,
  gateway: Gateway | null,
): Promise<Item[]> {
  let shapes: ItemShape[];
  if (gateway) {
    try {
      shapes = await generateItems(gateway, { genre, region: flavor, npc: npc?.persona ?? null });
    } catch {
      shapes = fallbackItems(genre);
    }
  } else {
    shapes = fallbackItems(genre);
  }

  const taken = new Set<string>();
  taken.add(`${region.spawn.x},${region.spawn.y}`);
  if (npc) taken.add(`${npc.x},${npc.y}`);

  const items: Item[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (!shape) continue;
    const pos = pickInteriorFloor(region, rng, taken);
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

function pickInteriorFloor(
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

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}
