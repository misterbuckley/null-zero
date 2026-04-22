import { fallbackBible, generateBible } from "../ai/bible.js";
import { fallbackFlavor, generateFlavor } from "../ai/flavor.js";
import type { Gateway } from "../ai/gateway.js";
import { fallbackItems, generateItems } from "../ai/items.js";
import { fallbackPersona, generatePersona } from "../ai/persona.js";
import type { ItemShape, NpcPersona, RegionFlavor, StoryBible } from "../ai/schemas.js";
import { generateCave } from "../world/generator/cave.js";
import type { Region } from "../world/region.js";
import { tileAt } from "../world/region.js";
import { type RNG, mulberry32, randInt } from "../world/rng.js";
import type { Item } from "./item.js";
import type { Npc } from "./npc.js";
import type { GameState } from "./state.js";

export interface NewGameOptions {
  seed: number;
  genre: string;
  gateway: Gateway | null;
}

export async function newGame(opts: NewGameOptions): Promise<GameState> {
  const rng = mulberry32(opts.seed);
  const region = generateCave(`r-0-0-${opts.seed}`, rng, { width: 90, height: 46 });

  const [flavor, bible] = await Promise.all([
    opts.gateway
      ? safeGenerateFlavor(opts.gateway, opts.genre)
      : Promise.resolve(fallbackFlavor(opts.genre, "cave")),
    opts.gateway
      ? safeGenerateBible(opts.gateway, opts.genre)
      : Promise.resolve(fallbackBible(opts.genre)),
  ]);
  region.flavor = flavor;

  const npcs = await placeNpcs(region, rng, opts.genre, flavor, opts.gateway);
  const items = await placeItems(region, rng, opts.genre, flavor, npcs[0] ?? null, opts.gateway);

  const now = Date.now();
  const log = [
    { ts: now, text: `You come to yourself in ${flavor.name}.`, kind: "note" as const },
    { ts: now, text: flavor.description, kind: "note" as const },
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
    player: { x: region.spawn.x, y: region.spawn.y },
    log,
    npcs,
    items,
    bible,
    revealedBeats: new Set<string>(),
    lastRevealAt: now,
  };
}

async function safeGenerateBible(gateway: Gateway, genre: string): Promise<StoryBible> {
  try {
    return await generateBible(gateway, { genre });
  } catch {
    return fallbackBible(genre);
  }
}

async function safeGenerateFlavor(gateway: Gateway, genre: string) {
  try {
    return await generateFlavor(gateway, { genre, biome: "cave" });
  } catch {
    return fallbackFlavor(genre, "cave");
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
    items.push({
      id: `item-${region.id}-${i}`,
      regionId: region.id,
      x: pos.x,
      y: pos.y,
      shape,
      properties: {},
    });
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
