import { heuristicIntent } from "../src/ai/intent.js";
import { carriedItems, contentsOf, dropAt, isContainer, isWorn, pickUp } from "../src/game/item.js";
import { newGame } from "../src/game/newGame.js";
import { travelThroughExit } from "../src/game/travel.js";
import { applyActionHooks, resolveIntent } from "../src/game/verbs.js";

function summarize(label: string, value: unknown) {
  console.log(`${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

const state = await newGame({ seed: 4242, genre: "dark fantasy", gateway: null });
console.log(`start place: ${state.region.placeId} - ${state.region.flavor?.name}`);

// Move player onto items (just drop them at player pos for test simplicity).
const rope = state.items.find((i) => i.shape.name === "rope, coiled")!;
const pendant = state.items.find((i) => i.shape.name === "brass pendant, broken")!;
const box = state.items.find((i) => i.shape.name === "small wooden box")!;
if (!rope || !pendant || !box) throw new Error("fallback items missing");

// Teleport player to spawn, drop all three at spawn.
state.player.x = state.region.spawn.x;
state.player.y = state.region.spawn.y;
for (const it of [rope, pendant, box]) {
  dropAt(it, state.region.id, state.player.x, state.player.y);
}

// --- M12a: take / drop / put ---
const takeRope = heuristicIntent("take rope");
summarize("parse take rope", takeRope);
console.log(
  "take rope:",
  await resolveIntent({ state, gateway: null, intent: takeRope, raw: "take rope" }),
);

const takePendant = heuristicIntent("take brass pendant");
console.log(
  "take pendant:",
  await resolveIntent({ state, gateway: null, intent: takePendant, raw: "take brass pendant" }),
);

// Put rope into the wooden box. Box is still on ground.
const putRope = heuristicIntent("put rope in wooden box");
summarize("parse put rope in box", putRope);
console.log(
  "put rope:",
  await resolveIntent({ state, gateway: null, intent: putRope, raw: "put rope in wooden box" }),
);

// Verify rope is inside the box.
const inside = contentsOf(state.items, box);
console.log(
  "box contents after put:",
  inside.map((i) => i.shape.name),
);
if (inside.length !== 1 || inside[0]!.id !== rope.id) throw new Error("rope should be in box");
if (!isContainer(box)) throw new Error("box should be container");

// Take rope back out.
const takeFromBox = heuristicIntent("take rope from wooden box");
summarize("parse take rope from box", takeFromBox);
console.log(
  "take from box:",
  await resolveIntent({
    state,
    gateway: null,
    intent: takeFromBox,
    raw: "take rope from wooden box",
  }),
);
console.log(
  "box contents after take:",
  contentsOf(state.items, box).map((i) => i.shape.name),
);
if (contentsOf(state.items, box).length !== 0) throw new Error("box should be empty");

// Drop pendant so combine would fail on a missing ingredient.
const dropIntent = heuristicIntent("drop brass pendant");
console.log(
  "drop pendant:",
  await resolveIntent({ state, gateway: null, intent: dropIntent, raw: "drop brass pendant" }),
);
console.log(
  "carrying after drop:",
  carriedItems(state.items).map((i) => i.shape.name),
);

// Pick the pendant back up for combine test.
pickUp(pendant);

// --- M12b: search / wait / listen / smell (fallback narration) ---
for (const raw of ["search wooden box", "wait", "listen", "smell"]) {
  const intent = heuristicIntent(raw);
  const out = await resolveIntent({ state, gateway: null, intent, raw });
  console.log(`${raw}: ${out}`);
}

// --- M12c: wear / remove ---
// pendant carries "broken" tag but also "marked"; it isn't wearable until
// we combine it with rope into the pendant-on-rope artifact.
const wearBroken = heuristicIntent("wear brass pendant");
console.log(
  "wear broken pendant:",
  await resolveIntent({ state, gateway: null, intent: wearBroken, raw: "wear brass pendant" }),
);

// --- M12d: combine ---
const combine = heuristicIntent("combine brass pendant with rope");
summarize("parse combine", combine);
const combineOut = await resolveIntent({
  state,
  gateway: null,
  intent: combine,
  raw: "combine brass pendant with rope",
});
console.log("combine:", combineOut);
const artifact = carriedItems(state.items).find((i) => i.shape.name === "pendant on frayed rope");
if (!artifact) throw new Error("artifact not created");
if (carriedItems(state.items).some((i) => i.id === pendant.id || i.id === rope.id)) {
  throw new Error("inputs not consumed");
}
console.log(
  "carrying after combine:",
  carriedItems(state.items).map((i) => i.shape.name),
);

// Wear the artifact (it has wearable tag).
const wearArtifact = heuristicIntent("wear pendant on frayed rope");
console.log(
  "wear artifact:",
  await resolveIntent({
    state,
    gateway: null,
    intent: wearArtifact,
    raw: "wear pendant on frayed rope",
  }),
);
if (!isWorn(artifact)) throw new Error("artifact should be worn");

// Remove it.
const takeOff = heuristicIntent("take off pendant on frayed rope");
summarize("parse take off", takeOff);
console.log(
  "remove artifact:",
  await resolveIntent({
    state,
    gateway: null,
    intent: takeOff,
    raw: "take off pendant on frayed rope",
  }),
);
if (isWorn(artifact)) throw new Error("artifact should not be worn");

// --- M12e: locked exit — explicit use X on door ---
const lockedExit = state.region.exits?.find((e) => e.toPlaceId === "p03");
console.log("p03 exit lockTag at start:", lockedExit?.lockTag);
if (!lockedExit?.lockTag) throw new Error("expected p03 exit to be locked");

// The artifact carries the 'brass' tag, which satisfies the p03 lock.
console.log("artifact tags:", artifact.shape.tags);

// Wrong key: pickUp the rope's place by putting the artifact aside temporarily.
// Easier to just verify the happy path + the auto-unlock match logic.
const useWrong = heuristicIntent("use nonexistent on door");
console.log(
  "use bogus on door:",
  await resolveIntent({ state, gateway: null, intent: useWrong, raw: "use nonexistent on door" }),
);
if (!lockedExit?.lockTag) throw new Error("bogus key must not unlock");

const useRight = heuristicIntent("use pendant on door");
summarize("parse use pendant on door", useRight);
console.log(
  "use artifact on door:",
  await resolveIntent({ state, gateway: null, intent: useRight, raw: "use pendant on door" }),
);
if (lockedExit?.lockTag) throw new Error("matching key should have unlocked");

console.log("traversing unlocked exit...");
await travelThroughExit(state, lockedExit, null);
console.log(
  "after travel through locked exit: regionId =",
  state.region.id,
  "placeId =",
  state.region.placeId,
);
if (state.region.placeId !== "p03") throw new Error("did not land at p03");

// --- M12 + M9d: action hooks still fire on the new verbs ---
// Seed an action-hook beat tied to 'search' → examine pattern. Re-use b03 which
// hooks on `examine brass pendant`; irrelevant here but we confirm that new
// verbs can be emitted through applyActionHooks without crashing.
const followUps = applyActionHooks(state, heuristicIntent("examine air"));
console.log("applyActionHooks with unrelated intent:", followUps);

console.log("\nsmoke ok");
