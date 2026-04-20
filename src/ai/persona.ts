import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import { type NpcPersona, NpcPersonaSchema, type RegionFlavor } from "./schemas.js";

export interface PersonaContext {
  genre: string;
  region: RegionFlavor | null;
}

export async function generatePersona(
  gateway: Gateway,
  ctx: PersonaContext,
): Promise<NpcPersona> {
  const place = ctx.region
    ? `The player encounters them in "${ctx.region.name}": ${ctx.region.description}`
    : "The setting details are unclear.";

  const user = `
Invent a single NPC the player might meet here.
Genre: ${ctx.genre}.
${place}

Do not make them a generic vendor or quest-giver. They should feel like they were in the middle of their own life before the player arrived.
Keep every field terse, specific, concrete. No adverbs where a noun will do.
  `.trim();

  return jsonComplete(
    gateway,
    {
      tier: "medium",
      system: `You are a character designer writing for a "${ctx.genre}" roguelike. Your NPCs have inner lives, obscured motives, and voices you can hear on the page. Think Gene Wolfe, M. John Harrison, China Miéville.`,
      messages: [{ role: "user", content: user }],
      maxTokens: 700,
    },
    NpcPersonaSchema,
  );
}

export function fallbackPersona(genre: string): NpcPersona {
  const base: Record<string, NpcPersona> = {
    "dark fantasy": {
      name: "Halven Rook",
      archetype: "disgraced priest",
      voice: "archaic, hedging, with the occasional scrap of dead liturgy",
      goals: ["regain his order's favor", "find his lost brother"],
      secrets: ["he set the fire at the orphanage"],
      disposition: "guarded-curious",
      appearance:
        "A thin man in a rope-belted cassock, one hand always at his throat where a pendant used to hang.",
    },
    cyberpunk: {
      name: "Wren Okabe",
      archetype: "street-level fixer",
      voice: "clipped, transactional, salted with loanwords",
      goals: ["move a crate of grey-market neural shims before dawn"],
      secrets: ["the shims are dud stock she's trying to pass as real"],
      disposition: "sizing-you-up",
      appearance: "Short, severe, dressed in a jacket too expensive for this alley.",
    },
    "post-apocalyptic": {
      name: "Old Teague",
      archetype: "salvager-turned-cartographer",
      voice: "slow, circular, prone to long silences",
      goals: ["finish his map of the dead highway"],
      secrets: ["he knows where a working radio is, and won't say"],
      disposition: "weary-friendly",
      appearance: "Sun-lined, layered in mismatched coats, pockets full of stubby pencils.",
    },
    "cosmic horror": {
      name: "Sister Ilse",
      archetype: "nightwatch at a shut asylum",
      voice: "level, too level, as if reading someone else's lines",
      goals: ["keep the east wing door closed for one more night"],
      secrets: ["she has started to hear what's on the other side of it"],
      disposition: "polite, hollow",
      appearance:
        "Narrow woman in a grey habit, hands very clean, eyes that do not quite track.",
    },
    noir: {
      name: "Detective Mara Voss",
      archetype: "homicide detective on suspension",
      voice: "dry, economical, the occasional dead-pan joke",
      goals: ["prove the case her lieutenant closed was closed too fast"],
      secrets: ["the prime suspect is her ex-husband"],
      disposition: "curt, testing",
      appearance: "Tall, rumpled coat, cigarette she never quite lights.",
    },
  };
  return (
    base[genre] ?? {
      name: "A stranger",
      archetype: "traveler",
      voice: "plain, careful, a little tired",
      goals: ["get somewhere else"],
      secrets: [],
      disposition: "neutral",
      appearance: "Someone passing through, dressed for weather they won't name.",
    }
  );
}
