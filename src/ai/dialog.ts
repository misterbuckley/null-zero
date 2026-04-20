import type { DialogTurn } from "../game/npc.js";
import type { Gateway } from "./gateway.js";
import type { NpcPersona, RegionFlavor, StoryBeat } from "./schemas.js";
import type { Message, StreamChunk } from "./types.js";

export interface DialogContext {
  persona: NpcPersona;
  region: RegionFlavor | null;
  genre: string;
  history: DialogTurn[];
  memorySummary: string;
  playerInput: string;
  plantBeat?: StoryBeat | null;
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

  const system = buildSystemPrompt(ctx);

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

function buildSystemPrompt(ctx: DialogContext): string {
  const { persona, region, genre, plantBeat } = ctx;
  const place = region
    ? `The scene is "${region.name}": ${region.description}`
    : "The setting is unclear.";

  const plant = plantBeat
    ? `\nIf — and only if — it feels natural in this exchange, let this slip into what you say (obliquely, not as exposition): ${plantBeat.reveals}\nIf the conversation is not a fit, do not force it.`
    : "";

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
    "",
    "Rules:",
    "- You are not an assistant. You are this person. Stay in first person.",
    "- One to three sentences per reply. Never monologue.",
    "- Do not narrate actions in asterisks or brackets. Speak, only.",
    "- Do not repeat the player's words back to them.",
    "- If the conversation is finished, say goodbye plainly and stop.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function* fallbackReply(ctx: DialogContext): AsyncIterable<StreamChunk> {
  const { persona, playerInput } = ctx;
  const lower = playerInput.toLowerCase().trim();

  let line: string;
  if (lower === "" || lower === "hello" || lower === "hi") {
    line = `${persona.name} looks up. "You again, or someone new. Say something worth hearing."`;
  } else if (lower === "goodbye" || lower === "bye") {
    line = `"Go on, then."`;
  } else if (lower.includes("who")) {
    line = `"I am ${persona.name}. ${persona.archetype.charAt(0).toUpperCase() + persona.archetype.slice(1)}. That is all that matters at this hour."`;
  } else if (lower.includes("what") && lower.includes("do")) {
    line = `"${persona.goals[0] ?? "Whatever I must."} Little else."`;
  } else {
    line = `${persona.name} considers you for a long moment. "I've no answer for that. Not yet."`;
  }

  for (const word of line.split(/(\s+)/)) {
    yield { kind: "delta", text: word };
    await new Promise((r) => setTimeout(r, 15));
  }
  yield { kind: "done", usage: { inputTokens: 0, outputTokens: 0 } };
}
