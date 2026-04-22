import { heuristicIntent } from "../src/ai/intent.js";
import { carriedItems, pickUp } from "../src/game/item.js";
import { newGame } from "../src/game/newGame.js";
import { resolveIntent } from "../src/game/verbs.js";

const state = await newGame({ seed: 7, genre: "noir", gateway: null });

// --- heuristicIntent ---
const cases = [
  "look",
  "look at letter",
  "examine case",
  "read the folded letter",
  "give letter to her",
  "use pen on door",
  "open box",
  "dance",
  "",
];
for (const raw of cases) {
  const intent = heuristicIntent(raw);
  console.log(`heur ${JSON.stringify(raw)} ->`, JSON.stringify(intent));
}

// --- resolveIntent: look with no target ---
const lookMsg = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "look" },
  raw: "look",
});
console.log("\nlook (no target):", lookMsg.slice(0, 160));

// --- put player next to an NPC and item for give ---
const npc = state.npcs[0];
if (!npc) {
  console.log("FAIL: no NPC placed");
  process.exit(1);
}

state.player.x = npc.x - 1;
state.player.y = npc.y;

const firstItem = state.items[0];
if (!firstItem) {
  console.log("FAIL: no items generated");
  process.exit(1);
}

// Move item adjacent too and look at it
firstItem.regionId = state.region.id;
firstItem.x = state.player.x;
firstItem.y = state.player.y;

const lookItem = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "look", target: firstItem.shape.name.split(",")[0] ?? firstItem.shape.name },
  raw: `look at ${firstItem.shape.name}`,
});
console.log("look item:", lookItem.slice(0, 160));

const lookNpc = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "examine", target: npc.persona.name },
  raw: `examine ${npc.persona.name}`,
});
console.log("examine npc:", lookNpc.slice(0, 160));

// --- read a document ---
const document = state.items.find((i) => i.shape.kind === "document");
if (document) {
  document.regionId = state.region.id;
  document.x = state.player.x;
  document.y = state.player.y;
  const readMsg = await resolveIntent({
    state,
    gateway: null,
    intent: { verb: "read", target: document.shape.name },
    raw: `read ${document.shape.name}`,
  });
  console.log("read document (fallback):", readMsg.slice(0, 160));
} else {
  console.log("no document item — skipping read test");
}

// --- give: pick up an item, then give it to adjacent NPC ---
const gift = state.items[0];
if (!gift) {
  console.log("FAIL: no gift item");
  process.exit(1);
}
pickUp(gift);
console.log(
  "carrying before give:",
  carriedItems(state.items).map((i) => i.shape.name),
);

const giveMsg = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "give", instrument: gift.shape.name, target: npc.persona.name },
  raw: `give ${gift.shape.name} to ${npc.persona.name}`,
});
console.log("give:", giveMsg);
console.log(
  "carrying after give:",
  carriedItems(state.items).map((i) => i.shape.name),
);
console.log("npc memory:", npc.memorySummary);
console.log(
  "state.items contains gift:",
  state.items.some((i) => i.id === gift.id),
);

// --- give: missing recipient ---
const missRecipient = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "give", instrument: "nothing", target: "nobody" },
  raw: "give nothing to nobody",
});
console.log("give-miss (fallback):", missRecipient.slice(0, 160));

// --- unknown verb falls through to narrate ---
const unknown = await resolveIntent({
  state,
  gateway: null,
  intent: { verb: "unknown" },
  raw: "dance wildly",
});
console.log("unknown (fallback):", unknown.slice(0, 160));

console.log("\nsmoke ok");
