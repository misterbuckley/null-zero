import type { LogEntry } from "../src/game/state.js";
import { renderLogTail, wrapPlain } from "../src/ui/logLayout.js";

function entry(text: string, kind: LogEntry["kind"] = "note"): LogEntry {
  return { ts: 0, text, kind };
}

// --- wrapPlain ---
const narrow = wrapPlain(
  "You pass through the arch and into a colder, vaster place than you expected.",
  20,
);
console.log("wrap @ 20:");
for (const l of narrow) console.log(`  |${l}|`);
if (narrow.some((l) => l.length > 20)) throw new Error("wrap should respect width");

const oneLong = wrapPlain("supercalifragilisticexpialidocious", 10);
console.log("hard-break long word:", oneLong);
if (oneLong.some((l) => l.length > 10)) throw new Error("long words must be hard-broken");

// --- renderLogTail: short entries fit, newest at the bottom ---
const shortEntries: LogEntry[] = [
  entry("one"),
  entry("two"),
  entry("three"),
  entry("four"),
  entry("five"),
];
const out1 = renderLogTail(shortEntries, 40, 5);
console.log("\nfive short entries, innerH=5:");
console.log(out1);
const lines1 = out1.split("\n");
if (lines1.length !== 5) throw new Error(`expected 5 lines, got ${lines1.length}`);
if (!lines1[4]!.includes("five")) throw new Error("newest must be on the bottom row");
if (!lines1[0]!.includes("one")) throw new Error("oldest of the five must be on top");

// --- renderLogTail: older entries overflow and are dropped ---
const many: LogEntry[] = Array.from({ length: 8 }, (_, i) => entry(`m${i}`));
const out2 = renderLogTail(many, 40, 3);
console.log("\n8 entries, innerH=3:");
console.log(out2);
const lines2 = out2.split("\n");
if (lines2.length !== 3) throw new Error(`expected 3 lines, got ${lines2.length}`);
if (!lines2[2]!.includes("m7")) throw new Error("newest (m7) must be on the bottom row");
if (!lines2[0]!.includes("m5")) throw new Error("oldest visible should be m5");

// --- The actual bug: a long entry wraps to 3 rows, innerH=5.
// Previously: four subsequent short messages would stay hidden because
// blessed anchored the old top. Now: each new message should appear.
const longText =
  "You cross into The Rookery, burnt. What remains of the orphanage: four blackened walls open to the sky, floorboards gnawed by rain.";
const afterLong: LogEntry[] = [entry(longText)];
const innerW = 40;
const wrappedCount = wrapPlain(longText, innerW).length;
console.log(`\nlong entry wraps to ${wrappedCount} visual rows at width ${innerW}.`);

const outA = renderLogTail(afterLong, innerW, 5);
const linesA = outA.split("\n");
console.log("just the long entry, innerH=5:");
console.log(outA);
if (linesA.length !== wrappedCount)
  throw new Error(`expected ${wrappedCount} lines, got ${linesA.length}`);

// Add one short message; it should appear on the last row, and the long entry
// should be clipped from the top — but its TAIL should still be visible.
afterLong.push(entry("A rat skitters away."));
const outB = renderLogTail(afterLong, innerW, 5);
console.log("\nlong + short, innerH=5:");
console.log(outB);
const linesB = outB.split("\n");
if (linesB.length !== 5) throw new Error(`expected 5 lines, got ${linesB.length}`);
if (!linesB[4]!.includes("rat skitters"))
  throw new Error("newest short line must be on the bottom");

// Add two more shorts — the long entry should get further clipped.
afterLong.push(entry("Somewhere, water drips."));
afterLong.push(entry("You bump against stone."));
const outC = renderLogTail(afterLong, innerW, 5);
console.log("\nlong + 3 shorts, innerH=5:");
console.log(outC);
const linesC = outC.split("\n");
if (linesC.length !== 5) throw new Error(`expected 5 lines, got ${linesC.length}`);
if (!linesC[4]!.includes("bump against stone"))
  throw new Error("newest ('bump') must be on the bottom");
if (!linesC[3]!.includes("water drips")) throw new Error("second-newest must be one row up");

console.log("\nsmoke ok");
