import { z } from "zod";

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
});

export type StoryBeat = z.infer<typeof StoryBeatSchema>;
export type StoryBible = z.infer<typeof StoryBibleSchema>;
