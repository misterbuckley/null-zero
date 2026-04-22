import type { Gateway } from "./gateway.js";
import type { Intent, RegionFlavor } from "./schemas.js";

export interface NarrateContext {
  genre: string;
  region: RegionFlavor | null;
  intent: Intent;
  raw: string;
  situation: string;
}

export async function narrateAction(gateway: Gateway | null, ctx: NarrateContext): Promise<string> {
  if (!gateway) return fallbackNarrate(ctx);

  try {
    const res = await gateway.complete({
      tier: "light",
      system: buildSystem(ctx),
      messages: [
        {
          role: "user",
          content: [
            `Player typed: ${JSON.stringify(ctx.raw)}`,
            `Parsed verb: ${ctx.intent.verb}`,
            ctx.intent.target ? `Target: ${ctx.intent.target}` : "",
            ctx.intent.instrument ? `Instrument: ${ctx.intent.instrument}` : "",
            `Situation: ${ctx.situation}`,
            "",
            "Narrate what happens in 1–2 sentences.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      maxTokens: 140,
      temperature: 0.85,
    });
    const text = res.text.trim();
    if (!text) return fallbackNarrate(ctx);
    return text;
  } catch {
    return fallbackNarrate(ctx);
  }
}

function buildSystem(ctx: NarrateContext): string {
  const where = ctx.region
    ? `Setting: "${ctx.region.name}" — ${ctx.region.description}`
    : "Setting details are unclear.";
  return [
    `You narrate player actions in a "${ctx.genre}" roguelike.`,
    where,
    "Rules:",
    "- Present tense, second person ('you').",
    "- One or two sentences. Concrete, sensory.",
    "- The world acknowledges the attempt but does not invent items, NPCs, or outcomes not already present.",
    "- If the action cannot resolve mechanically, let it land as atmosphere — a small observation, a shift in perception.",
    "- No dice talk, no stats, no system messages, no brackets.",
  ].join("\n");
}

export function fallbackNarrate(ctx: NarrateContext): string {
  const { verb, target } = ctx.intent;
  const t = target ? ` at ${stripQuotes(target)}` : "";
  if (verb === "unknown") {
    return `You try to ${stripQuotes(ctx.raw)}${t}. The world does not refuse it — but it does not answer either.`;
  }
  return `You ${verb}${t}. Nothing obvious changes.`;
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "").trim();
}
