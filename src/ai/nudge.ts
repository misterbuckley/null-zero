import type { NudgeHint } from "../story/beats.js";
import type { Gateway } from "./gateway.js";
import type { RegionFlavor, StoryBeat } from "./schemas.js";

export interface NudgeContext {
  beat: StoryBeat;
  hint: NudgeHint;
  genre: string;
  region: RegionFlavor | null;
}

export async function generateNudge(gateway: Gateway | null, ctx: NudgeContext): Promise<string> {
  if (!gateway) return fallbackNudge(ctx);

  try {
    const res = await gateway.complete({
      tier: "light",
      system: buildSystem(ctx),
      messages: [
        {
          role: "user",
          content: `Surface this quietly as a ${ctx.hint}: ${ctx.beat.reveals}`,
        },
      ],
      maxTokens: 160,
      temperature: 0.9,
    });
    const text = res.text.trim();
    if (!text) return fallbackNudge(ctx);
    return text;
  } catch {
    return fallbackNudge(ctx);
  }
}

function buildSystem(ctx: NudgeContext): string {
  const where = ctx.region
    ? `Setting: "${ctx.region.name}" — ${ctx.region.description}`
    : "Setting is unclear.";

  const mode =
    ctx.hint === "dream"
      ? "Write as a fleeting waking dream or intrusive image the player notices. Begin with 'You' or 'For a moment'."
      : "Write as an environmental cue the player notices (a draft, a carved mark, distant sound, stain on the wall). Do not address the player in second person for more than one clause.";

  return [
    `You plant story beats into a "${ctx.genre}" roguelike atmospherically.`,
    where,
    mode,
    "Rules:",
    "- One or two sentences. Present tense.",
    "- Oblique. Imply, don't explain. Never state the beat verbatim.",
    "- No brackets, no stage directions, no 'Narrator:' prefix.",
    "- Do not use the words 'story', 'beat', 'plot', or 'reveal'.",
  ].join("\n");
}

export function fallbackNudge(ctx: NudgeContext): string {
  const reveal = ctx.beat.reveals.trim().replace(/\s+/g, " ");
  if (ctx.hint === "dream") {
    return `For a moment you are elsewhere: ${firstClause(reveal)}. The feeling passes.`;
  }
  return `A draft carries something — a half-thought, a stain on the floor — and with it: ${firstClause(reveal)}.`;
}

function firstClause(s: string): string {
  const trimmed = s.replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/\.$/, "");
  const cut = trimmed.split(/[.;]/)[0] ?? trimmed;
  return cut.trim();
}
