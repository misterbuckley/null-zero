import { buildDialogSystemPrompt, dialogTurn } from "../src/ai/dialog.js";
import { pickUp } from "../src/game/item.js";
import { newGame } from "../src/game/newGame.js";

const state = await newGame({ seed: 3, genre: "noir", gateway: null });
const npc = state.npcs[0];
if (!npc) {
  console.log("FAIL: no NPC");
  process.exit(1);
}
// Make sure at least one item is carried so both buckets appear.
if (state.items[0]) pickUp(state.items[0]);

const ground = state.items
  .filter((i) => i.regionId === state.region.id)
  .map((i) => ({ name: i.shape.name, description: i.shape.description, where: "ground" as const }));
const carried = state.items
  .filter((i) => i.regionId === null)
  .map((i) => ({
    name: i.shape.name,
    description: i.shape.description,
    where: "carried" as const,
  }));
const affordances = {
  items: [...ground, ...carried],
  features: state.region.flavor?.notable_features ?? [],
};

const prompt = buildDialogSystemPrompt({
  persona: npc.persona,
  region: state.region.flavor ?? null,
  genre: state.genre,
  history: [],
  memorySummary: "",
  playerInput: "",
  plantBeat: null,
  affordances,
});

console.log("--- system prompt ---");
console.log(prompt);
console.log("---");

const expectations = [
  "Affordances",
  "Verbs the world understands",
  "look, examine, read",
  affordances.items[0]?.name ?? "",
  "oblique",
];
for (const needle of expectations) {
  console.log(`includes ${JSON.stringify(needle)}:`, prompt.includes(needle));
}

// Fallback reply references a ground object when the player asks for help.
async function collect(input: string) {
  let out = "";
  for await (const chunk of dialogTurn(null, {
    persona: npc.persona,
    region: state.region.flavor ?? null,
    genre: state.genre,
    history: [],
    memorySummary: "",
    playerInput: input,
    affordances,
  })) {
    if (chunk.kind === "delta" && chunk.text) out += chunk.text;
  }
  return out.trim();
}

const helpLine = await collect("I need help");
console.log("\nhelp fallback:", helpLine);
if (ground[0]) {
  console.log("references ground item:", helpLine.includes(ground[0].name));
}

const whatDoLine = await collect("what do you do here");
console.log("what-do fallback:", whatDoLine);

const whoLine = await collect("who are you");
console.log("who fallback:", whoLine);

console.log("\nsmoke ok");
