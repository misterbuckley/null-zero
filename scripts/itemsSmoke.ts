import { carriedItems, dropAt, onGround, pickUp } from "../src/game/item.js";
import { newGame } from "../src/game/newGame.js";
import { createSlot, deleteSlot, loadSlot, saveSlot } from "../src/persistence/save.js";

const testName = `items-${Date.now()}`;
const state = await newGame({ seed: 99, genre: "dark fantasy", gateway: null });
const slot = createSlot(testName, 99, state);

console.log(
  "initial items:",
  state.items.map((i) => `${i.shape.name} @(${i.x},${i.y})`),
);
console.log("ground count:", state.items.filter(onGround).length);
console.log("carried count:", carriedItems(state.items).length);

const first = state.items[0];
if (!first) {
  console.log("FAIL: no items generated");
  deleteSlot(slot.slug);
  process.exit(1);
}

pickUp(first);
console.log("after pickup — carried:", carriedItems(state.items).length);
console.log("first.regionId is null:", first.regionId === null);

saveSlot(slot.slug, state);
const { state: reloaded } = loadSlot(slot.slug);
console.log(
  "reloaded items:",
  reloaded.items.map((i) => `${i.shape.name} [carried=${i.regionId === null}]`),
);
console.log(
  "carried roundtrips:",
  carriedItems(reloaded.items).length === carriedItems(state.items).length,
);

// Drop again and roundtrip
const carried = reloaded.items.find((i) => i.regionId === null);
if (carried) {
  dropAt(carried, reloaded.region.id, reloaded.player.x, reloaded.player.y);
  saveSlot(slot.slug, reloaded);
  const { state: after } = loadSlot(slot.slug);
  const same = after.items.find((i) => i.id === carried.id);
  console.log(
    "drop roundtrip — on ground again:",
    same?.regionId === reloaded.region.id && same?.x === reloaded.player.x,
  );
}

deleteSlot(slot.slug);
console.log("cleaned up.");
