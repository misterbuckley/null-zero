import { newGame } from "../src/game/newGame.js";
import {
  createSlot,
  deleteSlot,
  listSaves,
  loadSlot,
  saveSlot,
} from "../src/persistence/save.js";

const testName = `roundtrip-${Date.now()}`;
const state = await newGame({
  seed: 12345,
  genre: "dark fantasy",
  gateway: null, // forces fallback flavor; no API call
});

const slot = createSlot(testName, 12345, state);
console.log("created:", slot.slug, "name:", slot.name);
console.log("flavor:", state.region.flavor?.name, "-", state.region.flavor?.ambience);

const loaded = loadSlot(slot.slug);
console.log(
  "loaded:",
  "player=",
  loaded.state.player,
  "tiles=",
  loaded.state.region.tiles.length,
  "logs=",
  loaded.state.log.length,
  "genre=",
  loaded.state.genre,
  "flavor.name=",
  loaded.state.region.flavor?.name,
);

loaded.state.player.x += 1;
loaded.state.log.push({ ts: Date.now(), text: "moved" });
saveSlot(slot.slug, loaded.state);

const reloaded = loadSlot(slot.slug);
console.log(
  "reloaded:",
  "player=",
  reloaded.state.player,
  "logs=",
  reloaded.state.log.map((e) => e.text),
  "flavor preserved=",
  reloaded.state.region.flavor?.name === loaded.state.region.flavor?.name,
);

const all = listSaves();
console.log("listed:", all.map((s) => s.name));

deleteSlot(slot.slug);
console.log("deleted.");
