import { fallbackAgenda } from "../src/ai/agenda.js";
import {
  DIALOG_CLOSE_MARKER,
  type DialogContext,
  buildDialogSystemPrompt,
  dialogTurn,
} from "../src/ai/dialog.js";
import type { NpcPersona, RegionFlavor } from "../src/ai/schemas.js";

const persona: NpcPersona = {
  name: "Halven Rook",
  archetype: "disgraced priest",
  voice: "low, dry, elliptical",
  goals: ["unburden a truth", "send the stranger on"],
  secrets: ["he set the fire"],
  disposition: "guarded-curious",
  appearance: "An old priest in soot-darkened vestments.",
};

const region: RegionFlavor = {
  name: "The Ashened Crypt",
  description: "A low, damp vault beneath a half-collapsed chapel.",
  ambience: "hushed",
  scents: ["damp stone", "old smoke"],
  notable_features: ["a soot-blackened altar"],
};

const agenda = fallbackAgenda({
  persona,
  region,
  genre: "dark fantasy",
  memorySummary: "",
});

console.log("agenda driving intent:", agenda.driving_intent);
console.log("target points:", agenda.target_points);
console.log("max turns:", agenda.max_turns);

// Inspect the system prompt shows the agenda section with turn accounting.
const prompt = buildDialogSystemPrompt({
  persona,
  region,
  genre: "dark fantasy",
  history: [],
  memorySummary: "",
  playerInput: "hello",
  agenda,
  turnsUsed: 0,
});
const mustContain = [
  "Your agenda for THIS conversation",
  "Driving intent:",
  "Target points",
  "Turn budget:",
  DIALOG_CLOSE_MARKER,
  "Do not end every reply with a question",
];
for (const s of mustContain) {
  if (!prompt.includes(s)) throw new Error(`prompt missing: ${s}`);
}
console.log("system prompt includes agenda + closing rule: ok");

// Fallback path under budget: no close marker.
async function reply(ctx: DialogContext): Promise<string> {
  let buf = "";
  for await (const chunk of dialogTurn(null, ctx)) {
    if (chunk.kind === "delta" && chunk.text) buf += chunk.text;
  }
  return buf;
}

const baseCtx: DialogContext = {
  persona,
  region,
  genre: "dark fantasy",
  history: [],
  memorySummary: "",
  playerInput: "what are you doing here?",
  agenda,
  turnsUsed: 0,
};

const mid = await reply({ ...baseCtx, turnsUsed: 0 });
console.log("turn 0 fallback:", mid);
if (mid.includes(DIALOG_CLOSE_MARKER)) throw new Error("fallback should not close early");

const atBudget = await reply({ ...baseCtx, turnsUsed: agenda.max_turns });
console.log("turn at-budget fallback:", atBudget);
if (!atBudget.includes(DIALOG_CLOSE_MARKER)) {
  throw new Error("fallback should emit close marker when budget is spent");
}

// Explicit goodbye also closes.
const goodbye = await reply({ ...baseCtx, playerInput: "goodbye", turnsUsed: 0 });
console.log("goodbye fallback:", goodbye);
if (!goodbye.includes(DIALOG_CLOSE_MARKER)) {
  throw new Error("goodbye should emit close marker");
}

console.log("\nsmoke ok");
