import { newGame } from "../src/game/newGame.js";
import { travelThroughExit } from "../src/game/travel.js";
import { createSlot, deleteSlot, loadSlot, saveSlot } from "../src/persistence/save.js";

const name = `travelsmoke-${Date.now()}`;
const state = await newGame({ seed: 42, genre: "dark fantasy", gateway: null });

console.log("start place:", state.region.placeId, "-", state.region.flavor?.name);
console.log(
  "bible places:",
  state.bible?.places.map((p) => `${p.id} ${p.name}`),
);

const exits = state.region.exits ?? [];
console.log(
  "exits from start:",
  exits.map((e) => `${e.id}:${e.toPlaceId}`),
);
if (exits.length === 0) throw new Error("no exits generated on start region");

const firstExit = exits[0]!;
const startRegionId = state.region.id;
const startNpcCount = state.npcs.length;
await travelThroughExit(state, firstExit, null);

console.log("after travel:");
console.log("  region now:", state.region.id, "placeId:", state.region.placeId);
console.log("  flavor:", state.region.flavor?.name);
console.log("  #regions:", Object.keys(state.regions).length);
console.log("  visited:", Array.from(state.visitedRegionIds));
console.log("  npcs total:", state.npcs.length);
console.log(
  "  destination exits:",
  state.region.exits?.map((e) => `${e.toPlaceId}${e.toRegionId ? " (bound)" : ""}`),
);

if (state.region.id === startRegionId) throw new Error("did not switch regions");
if (state.npcs.length <= startNpcCount) throw new Error("no npc added");
if (state.visitedRegionIds.size < 2) throw new Error("visited set did not grow");

// Confirm return exit works — find the exit leading back and use it.
const back = state.region.exits?.find((e) => e.toRegionId === startRegionId);
if (!back) throw new Error("no return exit bound");
await travelThroughExit(state, back, null);
console.log("after return: region =", state.region.id, `(start was ${startRegionId})`);
if (state.region.id !== startRegionId) throw new Error("did not return to start");

// Re-enter the previously-generated region — should NOT regenerate.
const reenterExit = state.region.exits?.find((e) => e.toPlaceId === firstExit.toPlaceId);
if (!reenterExit) throw new Error("start region lost its outbound exit");
const regionCountBefore = Object.keys(state.regions).length;
await travelThroughExit(state, reenterExit, null);
console.log("after re-enter: #regions =", Object.keys(state.regions).length);
if (Object.keys(state.regions).length !== regionCountBefore) {
  throw new Error("re-entry regenerated the region");
}

// Save + load round trip.
const slot = createSlot(name, 42, state);
saveSlot(slot.slug, state);
const reloaded = loadSlot(slot.slug).state;
console.log("reloaded #regions:", Object.keys(reloaded.regions).length);
console.log("reloaded visited:", Array.from(reloaded.visitedRegionIds));
console.log("reloaded current:", reloaded.region.id);
console.log(
  "reloaded exit tile restored:",
  reloaded.region.exits?.[0]
    ? reloaded.region.tiles[
        (reloaded.region.exits[0].y ?? 0) * reloaded.region.width +
          (reloaded.region.exits[0].x ?? 0)
      ]
    : "no exits",
);

deleteSlot(slot.slug);
console.log("smoke ok");
