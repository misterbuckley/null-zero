import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import { CANONICAL_VERBS, type Intent, IntentSchema } from "./schemas.js";

export interface IntentParseContext {
  regionItems: string[];
  carriedItems: string[];
  adjacentNpcs: string[];
  regionFeatures: string[];
}

export async function parseIntent(
  gateway: Gateway,
  raw: string,
  ctx: IntentParseContext,
): Promise<Intent> {
  const system = buildSystem(ctx);
  const user = `Player typed: ${JSON.stringify(raw)}\n\nReturn the best canonical parse.`;

  try {
    return await jsonComplete(
      gateway,
      {
        tier: "light",
        system,
        messages: [{ role: "user", content: user }],
        maxTokens: 200,
        temperature: 0.1,
      },
      IntentSchema,
    );
  } catch {
    // one retry with slightly higher temperature in case of a validation blip
    return jsonComplete(
      gateway,
      {
        tier: "light",
        system,
        messages: [{ role: "user", content: user }],
        maxTokens: 200,
        temperature: 0.3,
      },
      IntentSchema,
    );
  }
}

function buildSystem(ctx: IntentParseContext): string {
  const verbs = CANONICAL_VERBS.filter((v) => v !== "unknown").join(", ");
  const items = join("Ground items", ctx.regionItems);
  const carried = join("Carrying", ctx.carriedItems);
  const npcs = join("Adjacent people", ctx.adjacentNpcs);
  const features = join("Visible features", ctx.regionFeatures);

  return [
    "You parse a single player command into a strict JSON intent for a roguelike.",
    `Canonical verbs: ${verbs}. If none fit, use "unknown".`,
    "Map common synonyms:",
    "- 'look at', 'inspect', 'check' → look",
    "- 'examine', 'study' → examine",
    "- 'read', 'peruse' → read",
    "- 'use', 'apply', 'try' → use",
    "- 'give', 'hand', 'offer' → give",
    "- 'open', 'unlock', 'pry' → open",
    "- 'close', 'shut' → close",
    "- 'take', 'pick up', 'grab', 'pocket' → take",
    "- 'drop', 'put down', 'discard' → drop",
    "- 'put', 'place', 'stash', 'insert' → put",
    "- 'search', 'rummage', 'dig through' → search",
    "- 'wait', 'rest', 'linger' → wait",
    "- 'listen' → listen",
    "- 'smell', 'sniff' → smell",
    "- 'wear', 'don', 'put on' → wear",
    "- 'remove' (of a worn thing), 'take off' → remove",
    "- 'combine', 'join', 'fit together' → combine",
    "For 'put X in Y': instrument=X, location=Y.",
    "For 'take X from Y': target=X, location=Y.",
    "For 'use X on Y': instrument=X, target=Y.",
    "For 'give X to Y': instrument=X, target=Y.",
    "For 'combine X with Y' / 'combine X and Y': target=X, instrument=Y.",
    "Target, instrument, location, extra are short noun phrases quoting the player's language. Omit if absent.",
    "Context the player can currently act on:",
    items,
    carried,
    npcs,
    features,
    "Prefer matching target/instrument to those names when the player is plainly referring to one.",
  ]
    .filter(Boolean)
    .join("\n");
}

function join(label: string, xs: string[]): string {
  if (xs.length === 0) return `${label}: (none)`;
  return `${label}: ${xs.join(", ")}`;
}

export function heuristicIntent(raw: string): Intent {
  const lower = raw.trim().toLowerCase();
  if (!lower) return { verb: "unknown" };

  const firstWord = lower.split(/\s+/)[0] ?? "";
  const rest = lower.slice(firstWord.length).trim();

  const verbMap: Record<string, Intent["verb"]> = {
    look: "look",
    l: "look",
    inspect: "look",
    check: "look",
    examine: "examine",
    x: "examine",
    study: "examine",
    read: "read",
    use: "use",
    apply: "use",
    give: "give",
    hand: "give",
    offer: "give",
    open: "open",
    unlock: "open",
    close: "close",
    shut: "close",
    take: "take",
    grab: "take",
    pocket: "take",
    drop: "drop",
    discard: "drop",
    put: "put",
    place: "put",
    stash: "put",
    insert: "put",
    search: "search",
    rummage: "search",
    wait: "wait",
    rest: "wait",
    linger: "wait",
    listen: "listen",
    smell: "smell",
    sniff: "smell",
    wear: "wear",
    don: "wear",
    remove: "remove",
    combine: "combine",
    join: "combine",
  };

  // "pick up X" special two-word prefix
  if (lower.startsWith("pick up ")) {
    return { verb: "take", target: lower.slice(8).trim() || undefined };
  }
  if (lower.startsWith("put on ")) {
    return { verb: "wear", target: lower.slice(7).trim() || undefined };
  }
  if (lower.startsWith("take off ")) {
    return { verb: "remove", target: lower.slice(9).trim() || undefined };
  }
  if (lower.startsWith("put down ")) {
    return { verb: "drop", target: lower.slice(9).trim() || undefined };
  }

  const verb = verbMap[firstWord] ?? "unknown";

  if (verb === "give") {
    const m = rest.match(/^(.+?)\s+to\s+(.+)$/);
    if (m) return { verb, instrument: m[1]?.trim(), target: m[2]?.trim() };
  }

  if (verb === "use") {
    const m = rest.match(/^(.+?)\s+on\s+(.+)$/);
    if (m) return { verb, instrument: m[1]?.trim(), target: m[2]?.trim() };
  }

  if (verb === "put") {
    const m = rest.match(/^(.+?)\s+(?:in|into|on)\s+(.+)$/);
    if (m) return { verb, instrument: m[1]?.trim(), location: m[2]?.trim() };
  }

  if (verb === "take") {
    const m = rest.match(/^(.+?)\s+from\s+(.+)$/);
    if (m) return { verb, target: m[1]?.trim(), location: m[2]?.trim() };
  }

  if (verb === "combine") {
    const m = rest.match(/^(.+?)\s+(?:with|and)\s+(.+)$/);
    if (m) return { verb, target: m[1]?.trim(), instrument: m[2]?.trim() };
  }

  return rest ? { verb, target: rest } : { verb };
}
