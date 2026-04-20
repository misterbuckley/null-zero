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
