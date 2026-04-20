import { fallbackFlavor, generateFlavor } from "../ai/flavor.js";
import type { Gateway } from "../ai/gateway.js";
import { generateCave } from "../world/generator/cave.js";
import { mulberry32 } from "../world/rng.js";
import type { GameState } from "./state.js";

export interface NewGameOptions {
  seed: number;
  genre: string;
  gateway: Gateway | null;
}

export async function newGame(opts: NewGameOptions): Promise<GameState> {
  const rng = mulberry32(opts.seed);
  const region = generateCave(`r-0-0-${opts.seed}`, rng, { width: 90, height: 46 });

  const flavor = opts.gateway
    ? await safeGenerateFlavor(opts.gateway, opts.genre)
    : fallbackFlavor(opts.genre, "cave");
  region.flavor = flavor;

  const now = Date.now();
  const log = [
    { ts: now, text: `You come to yourself in ${flavor.name}.` },
    { ts: now, text: flavor.description },
    {
      ts: now,
      text: "Move with hjkl or arrows. S to save · Q for menu · ? for help (soon).",
    },
  ];

  return {
    genre: opts.genre,
    region,
    player: { x: region.spawn.x, y: region.spawn.y },
    log,
  };
}

async function safeGenerateFlavor(gateway: Gateway, genre: string) {
  try {
    return await generateFlavor(gateway, { genre, biome: "cave" });
  } catch {
    return fallbackFlavor(genre, "cave");
  }
}
