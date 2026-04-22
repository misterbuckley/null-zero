import { heuristicIntent } from "../src/ai/intent.js";
import { newGame } from "../src/game/newGame.js";
import { pushLog } from "../src/game/state.js";
import { applyActionHooks, resolveIntent } from "../src/game/verbs.js";
import { createSlot, deleteSlot, loadSlot, saveSlot } from "../src/persistence/save.js";

const testName = `hooks-${Date.now()}`;
const state = await newGame({ seed: 11, genre: "dark fantasy", gateway: null });
const slot = createSlot(testName, 11, state);

// Confirm the fallback bible's b03 carries the action hook.
const b03 = state.bible?.beats.find((b) => b.id === "b03");
console.log("b03 title:", b03?.title);
console.log("b03 hooks:", JSON.stringify(b03?.action_hooks));

// Gate preconditions: b03 needs 14 dialog turns. Simulate by stuffing the NPC's turns.
const npc = state.npcs[0];
if (!npc) {
  console.log("FAIL: no NPC");
  deleteSlot(slot.slug);
  process.exit(1);
}
for (let i = 0; i < 14; i++) {
  npc.turns.push({ role: "player", content: `q${i}`, ts: Date.now() });
  npc.turns.push({ role: "npc", content: `a${i}`, ts: Date.now() });
}

// Make sure the pendant exists and sits where the player is.
const pendant = state.items.find((it) => it.shape.name.toLowerCase().includes("pendant"));
if (!pendant) {
  console.log("FAIL: no pendant in starting items");
  deleteSlot(slot.slug);
  process.exit(1);
}
pendant.regionId = state.region.id;
pendant.x = state.player.x;
pendant.y = state.player.y;

// Non-matching action: examining the rope should NOT fire b03.
const intent1 = heuristicIntent("examine rope");
const msg1 = await resolveIntent({ state, gateway: null, intent: intent1, raw: "examine rope" });
pushLog(state, msg1);
const fu1 = applyActionHooks(state, intent1);
console.log("rope examine followUps:", fu1);
console.log("b03 revealed after rope:", state.revealedBeats.has("b03"));

// Matching action: examining the pendant fires b03.
const intent2 = heuristicIntent("examine brass pendant");
console.log("intent for pendant:", JSON.stringify(intent2));
const msg2 = await resolveIntent({
  state,
  gateway: null,
  intent: intent2,
  raw: "examine brass pendant",
});
pushLog(state, msg2);
console.log("primary line:", msg2.slice(0, 160));

const fu2 = applyActionHooks(state, intent2);
for (const line of fu2) pushLog(state, line);
console.log("pendant examine followUps:", fu2);
console.log("b03 revealed after pendant:", state.revealedBeats.has("b03"));
console.log("npc memory after payoff:", npc.memorySummary);

// Re-running the same action should NOT fire again (already revealed).
const fu3 = applyActionHooks(state, intent2);
console.log("followUps on second try (should be empty):", fu3);

// Persistence: reload and confirm revealed beats + memory survive.
saveSlot(slot.slug, state);
const { state: reloaded } = loadSlot(slot.slug);
console.log("reloaded b03 in revealedBeats:", reloaded.revealedBeats.has("b03"));
console.log("reloaded npc memory:", reloaded.npcs[0]?.memorySummary);
const reloadedBeat = reloaded.bible?.beats.find((b) => b.id === "b03");
console.log("reloaded b03 hooks preserved:", JSON.stringify(reloadedBeat?.action_hooks));

deleteSlot(slot.slug);
console.log("cleaned up.");
