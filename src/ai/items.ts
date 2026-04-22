import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import { ItemListSchema, type ItemShape, type NpcPersona, type RegionFlavor } from "./schemas.js";

export interface ItemGenContext {
  genre: string;
  region: RegionFlavor | null;
  npc: NpcPersona | null;
}

export async function generateItems(gateway: Gateway, ctx: ItemGenContext): Promise<ItemShape[]> {
  const place = ctx.region
    ? `Setting: "${ctx.region.name}" — ${ctx.region.description}`
    : "Setting details unclear.";
  const who = ctx.npc
    ? `Someone is here: ${ctx.npc.name}, ${ctx.npc.archetype}. ${ctx.npc.appearance}`
    : "There is no one else here.";

  const user = `
Pick 1–3 small, findable objects the player could notice on the ground or on a surface in this region. Each should feel inevitable to the space — not decorative set dressing.

${place}
${who}

Rules:
- Concrete, specific, genre-true. No generic "a rusty sword" or "a healing potion".
- Each description is 1–2 sentences, present tense, second person only if needed.
- Tags are short lowercase words (materials, conditions, possible uses).
- Don't describe the item's function as if it were a game item. Describe it as a thing in the world.
  `.trim();

  const result = await jsonComplete(
    gateway,
    {
      tier: "medium",
      system: `You populate scenes with small, telling objects for a "${ctx.genre}" roguelike. You think like a location scout with a miser's budget: one or two things, each doing real work.`,
      messages: [{ role: "user", content: user }],
      maxTokens: 700,
      temperature: 0.85,
    },
    ItemListSchema,
  );

  return result.items;
}

export function fallbackItems(genre: string): ItemShape[] {
  const base: Record<string, ItemShape[]> = {
    "dark fantasy": [
      {
        name: "rope, coiled",
        description:
          "A length of greased hemp rope, coiled tight and dark with old soot. The end is frayed as if it last held something that did not want to be held.",
        kind: "tool",
        tags: ["rope", "sooted", "bearing-weight"],
      },
      {
        name: "brass pendant, broken",
        description:
          "A small brass disc the size of a thumbnail, snapped at the bail. On one face, a crude hand; on the other, a number worn almost away.",
        kind: "trinket",
        tags: ["brass", "broken", "marked"],
      },
    ],
    cyberpunk: [
      {
        name: "cheap dataslug",
        description:
          "A plastic slug the size of a tooth, its contact pins bent. A strip of electrical tape on one face reads 'DO NOT PLUG IN'.",
        kind: "document",
        tags: ["storage", "warning", "tampered"],
      },
      {
        name: "cracked stim-pen",
        description:
          "An injector pen, the reservoir hairline-cracked and sticky. A third of the dose is gone.",
        kind: "tool",
        tags: ["pharma", "used", "leaking"],
      },
    ],
    "post-apocalyptic": [
      {
        name: "hand-drawn map fragment",
        description:
          "A corner torn from a larger map. A pencil mark circles an unlabeled spot. The paper has been wet and dried at least twice.",
        kind: "document",
        tags: ["paper", "partial", "annotated"],
      },
      {
        name: "tin can of something",
        description:
          "A dented tin can with the label long peeled off. It still has weight. Something shifts inside when you tilt it.",
        kind: "container",
        tags: ["metal", "sealed", "unlabeled"],
      },
    ],
    "cosmic horror": [
      {
        name: "ward-paper, folded",
        description:
          "A small rectangle of rice paper inked with a crowded symbol. The ink is brown where it should be black, and in one corner, someone has written a name and then scratched it out.",
        kind: "trinket",
        tags: ["paper", "marked", "defaced"],
      },
    ],
    noir: [
      {
        name: "cigarette case, engraved",
        description:
          "A silver-plated case, the plate worn through at the corners. The engraving inside is a date six months before the case's maker went out of business.",
        kind: "trinket",
        tags: ["silver", "engraved", "inherited"],
      },
      {
        name: "folded letter",
        description:
          "A letter folded small enough to fit a wallet, creases thin as paper can go. The salutation is 'M —' and the signature is missing.",
        kind: "document",
        tags: ["paper", "partial", "private"],
      },
    ],
  };

  return (
    base[genre] ?? [
      {
        name: "a small, dense stone",
        description:
          "A smooth river stone, unexpectedly heavy for its size. Someone has scratched a mark into it: a line with a dot above.",
        kind: "trinket",
        tags: ["stone", "marked"],
      },
    ]
  );
}
