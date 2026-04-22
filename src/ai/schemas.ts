import { z } from "zod";

export const PlaceSchema = z.object({
  id: z.string().describe("Short stable identifier like 'p01'. Lowercase, 2–4 chars."),
  name: z.string().describe("Short, evocative name (1–4 words). No trailing punctuation."),
  description: z
    .string()
    .describe(
      "One or two sentences setting this location apart from the others: mood, one concrete detail.",
    ),
  biome: z
    .string()
    .describe(
      "Short biome tag used for procedural generation. Allowed: 'cave', 'ruin', 'street', 'tunnel', 'chamber'.",
    ),
});

export type Place = z.infer<typeof PlaceSchema>;

export const RegionFlavorSchema = z.object({
  name: z
    .string()
    .describe("Short, evocative name for the region (1–4 words). No trailing punctuation."),
  description: z
    .string()
    .describe(
      "Two to four sentences of atmospheric prose describing what the player perceives on entry. Present tense.",
    ),
  ambience: z
    .string()
    .describe("A short mood tag (1–2 words), e.g. 'eerie', 'bustling', 'desolate'."),
  scents: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("One to four distinct smells the player would notice."),
  notable_features: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("Concrete things in the region the player could look at or interact with."),
});

export type RegionFlavor = z.infer<typeof RegionFlavorSchema>;

export const NpcPersonaSchema = z.object({
  name: z.string().describe("Full name the NPC introduces themselves with (1–4 words)."),
  archetype: z
    .string()
    .describe("Short role/archetype — e.g., 'disgraced priest', 'bone-market fence'."),
  voice: z.string().describe("One-line description of how they speak: register, tics, cadence."),
  goals: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("1–3 things this NPC is currently trying to achieve."),
  secrets: z
    .array(z.string())
    .min(0)
    .max(2)
    .describe("0–2 facts this NPC hides. May slip under pressure."),
  disposition: z
    .string()
    .describe(
      "Current stance toward the player, e.g., 'guarded-curious', 'openly hostile', 'indifferent'.",
    ),
  appearance: z.string().describe("One or two sentences describing what the player sees."),
});

export type NpcPersona = z.infer<typeof NpcPersonaSchema>;

export const CANONICAL_VERBS = [
  "look",
  "examine",
  "read",
  "use",
  "give",
  "open",
  "close",
  "unknown",
] as const;

export type CanonicalVerb = (typeof CANONICAL_VERBS)[number];

export const ActionHookSchema = z.object({
  verb: z
    .enum(CANONICAL_VERBS)
    .describe("One canonical verb. Use the same set the player-parser uses."),
  target: z
    .string()
    .optional()
    .describe(
      "Short noun phrase the player's action must be directed at (item name, NPC name, or visible feature). Omit to match any target.",
    ),
  instrument: z
    .string()
    .optional()
    .describe(
      "Short noun phrase the player must use as the tool or offering (e.g., for 'give' the thing being handed over). Omit to match any.",
    ),
  location: z
    .string()
    .optional()
    .describe("Where the action must happen, if relevant. Omit to match any location."),
});

export type ActionHook = z.infer<typeof ActionHookSchema>;

export const StoryBeatSchema = z.object({
  id: z
    .string()
    .describe("Short stable identifier like 'b01', 'b02'. Used to track which beats have fired."),
  title: z.string().describe("Short evocative title for this beat, 2–6 words."),
  preconditions: z
    .array(z.string())
    .describe(
      "Machine-readable conditions for this beat to become eligible. Use only these forms: 'dialog_turns>=N', 'moves>=N', 'talked_to_any'. 0–2 entries.",
    ),
  reveals: z
    .string()
    .describe(
      "One to two sentences of the concrete fact or fragment that should surface when this beat fires. Will be woven into NPC dialog or environment.",
    ),
  delivery_hints: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe(
      "Where this beat might naturally surface. Allowed values: 'npc_rumor', 'found_document', 'environmental', 'dream'.",
    ),
  action_hooks: z
    .array(ActionHookSchema)
    .max(3)
    .optional()
    .describe(
      "0–3 concrete player actions that pay off this beat. If the player performs any of them, the beat fires. Only set this when the beat's reveal is naturally triggered by a specific action on something that exists in the world.",
    ),
});

export const StoryBibleSchema = z.object({
  logline: z.string().describe("One sentence summary of the core story. No fluff."),
  central_mystery: z
    .string()
    .describe("What the player is, on some level, trying to understand. 1–2 sentences."),
  factions: z
    .array(
      z.object({
        name: z.string(),
        agenda: z.string().describe("What this faction wants, in one line."),
        secret: z.string().describe("What they hide."),
      }),
    )
    .min(1)
    .max(3),
  key_characters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().describe("Their place in the story."),
        hidden_truth: z.string().describe("Something the player will discover about them."),
      }),
    )
    .min(1)
    .max(4),
  beats: z
    .array(StoryBeatSchema)
    .min(3)
    .max(6)
    .describe(
      "Soft-ordered beats that can fire as the player plays. Earlier beats should have easier preconditions.",
    ),
  places: z
    .array(PlaceSchema)
    .min(3)
    .max(7)
    .describe(
      "3–7 distinct named locations the player can discover. The first place is where they begin; others connect via exits.",
    ),
});

export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StoryBible = z.infer<typeof StoryBibleSchema>;

export const ItemSchema = z.object({
  name: z.string().describe("Short specific name the player would use (1–4 words). No article."),
  description: z
    .string()
    .describe(
      "One or two sentences of what the player sees and senses when they look at it. Present tense.",
    ),
  kind: z
    .string()
    .describe(
      "Short category word: 'tool', 'document', 'trinket', 'container', 'garment', 'fragment', etc.",
    ),
  tags: z
    .array(z.string())
    .min(0)
    .max(5)
    .describe(
      "0–5 short lowercase tags: materials, uses, states (e.g., 'brass', 'readable', 'wet').",
    ),
});

export type ItemShape = z.infer<typeof ItemSchema>;

export const ItemListSchema = z.object({
  items: z
    .array(ItemSchema)
    .min(1)
    .max(3)
    .describe("1–3 items that fit the region's mood and genre. Nothing generic."),
});

export type ItemList = z.infer<typeof ItemListSchema>;

export const IntentSchema = z.object({
  verb: z
    .enum(CANONICAL_VERBS)
    .describe(
      "The canonical verb that best matches the player's phrasing. Use 'unknown' if none fit.",
    ),
  target: z
    .string()
    .optional()
    .describe(
      "Short noun phrase the action is directed at (an item name, NPC name, or visible feature). Omit if not specified.",
    ),
  instrument: z
    .string()
    .optional()
    .describe("Short noun phrase the action uses as a tool or offering. Omit if not specified."),
  location: z.string().optional().describe("Where the action happens, if stated. Omit otherwise."),
  extra: z
    .string()
    .optional()
    .describe("Anything else worth preserving from the player's phrasing. Keep terse."),
});

export type Intent = z.infer<typeof IntentSchema>;
