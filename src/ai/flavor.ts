import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import { type RegionFlavor, RegionFlavorSchema } from "./schemas.js";

export interface FlavorContext {
  genre: string;
  biome: string;
  adjacentSummaries?: string[];
}

export async function generateFlavor(
  gateway: Gateway,
  ctx: FlavorContext,
): Promise<RegionFlavor> {
  const adjacency = ctx.adjacentSummaries?.length
    ? `Nearby regions the player has already explored:\n${ctx.adjacentSummaries
        .map((s) => `- ${s}`)
        .join("\n")}`
    : "There are no previously explored regions adjacent to this one.";

  const user = `
The player is about to enter a newly-generated region.
Biome: ${ctx.biome}.
${adjacency}

Produce a flavor package for this region. Keep language tight and evocative; avoid cliché and filler.
  `.trim();

  return jsonComplete(
    gateway,
    {
      tier: "medium",
      system: `You are a worldbuilder in the "${ctx.genre}" genre. You write terse, atmospheric room descriptions with concrete, specific detail. Aim for the voice of Gene Wolfe or M. John Harrison: understated, strange, precise.`,
      messages: [{ role: "user", content: user }],
      maxTokens: 600,
    },
    RegionFlavorSchema,
  );
}

export function fallbackFlavor(genre: string, biome: string): RegionFlavor {
  const biomeAdj =
    biome === "cave"
      ? "cold, dim"
      : biome === "ruin"
        ? "crumbling, half-swallowed by moss"
        : "quiet";
  return {
    name: capitalize(`${biome} chamber`),
    description: `A ${biomeAdj} ${biome} stretches in all directions. The air is still. Somewhere, water drips, though you cannot tell from where. The ${genre} of this place is in its silences.`,
    ambience: "desolate",
    scents: ["damp stone", "iron"],
    notable_features: ["a scattering of rubble", "an old scratch-mark on the wall"],
  };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}
