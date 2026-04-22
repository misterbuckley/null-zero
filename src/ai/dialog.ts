import type { DialogTurn } from "../game/npc.js";
import type { Gateway } from "./gateway.js";
import { CANONICAL_VERBS, type NpcPersona, type RegionFlavor, type StoryBeat } from "./schemas.js";
import type { Message, StreamChunk } from "./types.js";

export interface AffordanceItem {
  name: string;
  description: string;
  where: "ground" | "carried";
  worn?: boolean;
  container?: boolean;
  contents?: string[];
}

export interface Affordances {
  items: AffordanceItem[];
  features: string[];
}

export interface DialogContext {
  persona: NpcPersona;
  region: RegionFlavor | null;
  genre: string;
  history: DialogTurn[];
  memorySummary: string;
  playerInput: string;
  plantBeat?: StoryBeat | null;
  affordances?: Affordances;
}

const HISTORY_WINDOW = 10;

export async function* dialogTurn(
  gateway: Gateway | null,
  ctx: DialogContext,
): AsyncIterable<StreamChunk> {
  if (!gateway) {
    yield* fallbackReply(ctx);
    return;
  }

  const recent = ctx.history.slice(-HISTORY_WINDOW);
  const messages: Message[] = [];

  if (ctx.memorySummary) {
    messages.push({
      role: "user",
      content: `Earlier, in summary: ${ctx.memorySummary}`,
    });
    messages.push({
      role: "assistant",
      content: "I remember.",
    });
  }

  for (const turn of recent) {
    messages.push({
      role: turn.role === "player" ? "user" : "assistant",
      content: turn.content,
    });
  }

  messages.push({ role: "user", content: ctx.playerInput });

  const system = buildDialogSystemPrompt(ctx);

  try {
    yield* gateway.stream({
      tier: "light",
      system,
      messages,
      maxTokens: 400,
      temperature: 0.9,
    });
  } catch {
    yield* fallbackReply(ctx);
  }
}

export function buildDialogSystemPrompt(ctx: DialogContext): string {
  const { persona, region, genre, plantBeat, affordances } = ctx;
  const place = region
    ? `The scene is "${region.name}": ${region.description}`
    : "The setting is unclear.";

  const plant = plantBeat
    ? `\nIf — and only if — it feels natural in this exchange, let this slip into what you say (obliquely, not as exposition): ${plantBeat.reveals}\nIf the conversation is not a fit, do not force it.`
    : "";

  const affordanceSection = affordances ? buildAffordanceSection(affordances) : "";

  return [
    `You are ${persona.name}, ${persona.archetype}, in a "${genre}" world.`,
    `Your voice: ${persona.voice}.`,
    `Your goals right now: ${persona.goals.join("; ")}.`,
    persona.secrets.length > 0
      ? `You guard these secrets and will only hint at them under pressure: ${persona.secrets.join("; ")}.`
      : "",
    `Your disposition toward the stranger speaking to you: ${persona.disposition}.`,
    place,
    plant,
    affordanceSection,
    "",
    "Rules:",
    "- You are not an assistant. You are this person. Stay in first person.",
    "- One to three sentences per reply. Never monologue.",
    "- Do not narrate actions in asterisks or brackets. Speak, only.",
    "- Do not repeat the player's words back to them.",
    "- If the conversation is finished, say goodbye plainly and stop.",
    "- Any concrete suggestion you give the stranger must be something they could actually do in this world: an action from the verb list, targeting a thing in the Affordances. If it isn't in that list, keep your hint oblique — metaphor, rumor, feeling — never name an object or place that doesn't exist.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function buildAffordanceSection(aff: Affordances): string {
  const verbs = CANONICAL_VERBS.filter((v) => v !== "unknown").join(", ");
  const ground = aff.items.filter((i) => i.where === "ground");
  const carried = aff.items.filter((i) => i.where === "carried");
  const worn = carried.filter((i) => i.worn);

  const lines = ["", "Affordances (what the stranger can actually do and reach):"];
  lines.push(`- Verbs the world understands: ${verbs}.`);
  if (ground.length > 0) {
    lines.push("- Nearby objects in this region:");
    for (const it of ground) lines.push(`  · ${describeAffordanceItem(it)}`);
  } else {
    lines.push("- Nearby objects in this region: none you can see from here.");
  }
  if (carried.length > 0) {
    lines.push("- Things the stranger is carrying:");
    for (const it of carried) lines.push(`  · ${describeAffordanceItem(it)}`);
  }
  if (worn.length > 0) {
    lines.push(`- They are wearing: ${worn.map((w) => w.name).join(", ")}.`);
  }
  if (aff.features.length > 0) {
    lines.push(`- Notable features here: ${aff.features.join("; ")}.`);
  }
  return lines.join("\n");
}

function describeAffordanceItem(it: AffordanceItem): string {
  const parts = [`${it.name} — ${it.description}`];
  if (it.worn) parts.push("(worn)");
  if (it.container) {
    const inside =
      it.contents && it.contents.length > 0 ? `(contains: ${it.contents.join(", ")})` : "(empty)";
    parts.push(inside);
  }
  return parts.join(" ");
}

async function* fallbackReply(ctx: DialogContext): AsyncIterable<StreamChunk> {
  const { persona, playerInput, affordances } = ctx;
  const lower = playerInput.toLowerCase().trim();
  const ground = affordances?.items.filter((i) => i.where === "ground") ?? [];
  const firstObject = ground[0]?.name;

  let line: string;
  if (lower === "" || lower === "hello" || lower === "hi") {
    line = `${persona.name} looks up. "You again, or someone new. Say something worth hearing."`;
  } else if (lower === "goodbye" || lower === "bye") {
    line = `"Go on, then."`;
  } else if (lower.includes("who")) {
    line = `"I am ${persona.name}. ${persona.archetype.charAt(0).toUpperCase() + persona.archetype.slice(1)}. That is all that matters at this hour."`;
  } else if (lower.includes("what") && lower.includes("do")) {
    line = firstObject
      ? `"${persona.goals[0] ?? "Whatever I must."} You could start by looking at the ${firstObject}, if you have eyes for it."`
      : `"${persona.goals[0] ?? "Whatever I must."} Little else."`;
  } else if ((lower.includes("help") || lower.includes("advice")) && firstObject) {
    line = `"If I were you, I'd examine the ${firstObject} before I asked another question."`;
  } else {
    line = `${persona.name} considers you for a long moment. "I've no answer for that. Not yet."`;
  }

  for (const word of line.split(/(\s+)/)) {
    yield { kind: "delta", text: word };
    await new Promise((r) => setTimeout(r, 15));
  }
  yield { kind: "done", usage: { inputTokens: 0, outputTokens: 0 } };
}
