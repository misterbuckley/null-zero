import { newGame } from "../src/game/newGame.js";
import {
  createSlot,
  deleteSlot,
  listSaves,
  loadSlot,
  saveSlot,
} from "../src/persistence/save.js";
import { markRevealed, pickPlantableBeat } from "../src/story/beats.js";

const testName = `roundtrip-${Date.now()}`;
const state = await newGame({
  seed: 12345,
  genre: "dark fantasy",
  gateway: null,
});

const slot = createSlot(testName, 12345, state);
console.log("created:", slot.slug);
console.log("flavor:", state.region.flavor?.name);
console.log("npc:", state.npcs[0]?.persona.name);
console.log("bible logline:", state.bible?.logline);
console.log("bible beats:", state.bible?.beats.map((b) => b.id));

// Simulate some dialog turns then check beat eligibility
const npc = state.npcs[0];
if (npc) {
  for (let i = 0; i < 3; i++) {
    npc.turns.push({ role: "player", content: `q${i}`, ts: Date.now() });
    npc.turns.push({ role: "npc", content: `a${i}`, ts: Date.now() });
  }
}

const beat = pickPlantableBeat(state);
console.log("plantable after 3 turns:", beat?.id, beat?.title);
if (beat) markRevealed(state, beat.id);

saveSlot(slot.slug, state);

const reloaded = loadSlot(slot.slug);
console.log("reloaded bible logline:", reloaded.state.bible?.logline);
console.log(
  "reloaded revealed beats:",
  Array.from(reloaded.state.revealedBeats),
);
console.log(
  "next plantable after reveal:",
  pickPlantableBeat(reloaded.state)?.id,
);

console.log("listed:", listSaves().map((s) => s.name));
deleteSlot(slot.slug);
console.log("deleted.");
