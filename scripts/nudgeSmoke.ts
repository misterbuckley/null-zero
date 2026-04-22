import { fallbackNudge, generateNudge } from "../src/ai/nudge.js";
import { newGame } from "../src/game/newGame.js";
import { pushLog } from "../src/game/state.js";
import { createSlot, deleteSlot, loadSlot, saveSlot } from "../src/persistence/save.js";
import { NUDGE_IDLE_MS, markRevealed, pickNudge, pickPlantableBeat } from "../src/story/beats.js";

const testName = `nudge-${Date.now()}`;
const state = await newGame({ seed: 42, genre: "dark fantasy", gateway: null });
const slot = createSlot(testName, 42, state);

console.log(
  "bible beats:",
  state.bible?.beats.map((b) => `${b.id}:${b.delivery_hints.join(",")}`),
);
console.log("initial lastRevealAt diff (ms):", Date.now() - state.lastRevealAt);

// No nudge yet — within idle threshold
console.log("immediate nudge:", pickNudge(state));

// Simulate idle time
state.lastRevealAt = Date.now() - NUDGE_IDLE_MS - 1000;
const candidate = pickNudge(state);
console.log("nudge after idle:", candidate?.beat.id, candidate?.hint);

if (candidate) {
  const fallback = fallbackNudge({
    beat: candidate.beat,
    hint: candidate.hint,
    genre: state.genre,
    region: state.region.flavor ?? null,
  });
  console.log("fallback text:", fallback);

  // Also exercise the null-gateway path of generateNudge
  const text = await generateNudge(null, {
    beat: candidate.beat,
    hint: candidate.hint,
    genre: state.genre,
    region: state.region.flavor ?? null,
  });
  console.log("generateNudge(null) matches fallback:", text === fallback);

  pushLog(state, text, "nudge");
  markRevealed(state, candidate.beat.id);
}

// After firing, lastRevealAt was bumped — no further nudge available
console.log("nudge immediately after reveal:", pickNudge(state));

// Save + reload, confirm persistence
saveSlot(slot.slug, state);
const { state: reloaded } = loadSlot(slot.slug);
console.log("reloaded revealed beats:", Array.from(reloaded.revealedBeats));
console.log(
  "reloaded nudge log entries:",
  reloaded.log.filter((l) => l.kind === "nudge").map((l) => l.text),
);
console.log("reloaded lastRevealAt preserved:", reloaded.lastRevealAt === state.lastRevealAt);

// Push lastRevealAt back and check pickNudge picks the next beat (if any is eligible)
reloaded.lastRevealAt = Date.now() - NUDGE_IDLE_MS - 1000;
const next = pickPlantableBeat(reloaded);
console.log("next plantable beat (may be null if preconditions gate):", next?.id);
const nextNudge = pickNudge(reloaded);
console.log("next nudge candidate:", nextNudge?.beat.id, nextNudge?.hint);

deleteSlot(slot.slug);
console.log("cleaned up.");
