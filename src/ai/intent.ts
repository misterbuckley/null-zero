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
  };

  const verb = verbMap[firstWord] ?? "unknown";

  // Very light parsing: "give X to Y" → instrument=X, target=Y
  if (verb === "give") {
    const m = rest.match(/^(.+?)\s+to\s+(.+)$/);
    if (m) return { verb, instrument: m[1]?.trim(), target: m[2]?.trim() };
  }

  // "use X on Y" → instrument=X, target=Y
  if (verb === "use") {
    const m = rest.match(/^(.+?)\s+on\s+(.+)$/);
    if (m) return { verb, instrument: m[1]?.trim(), target: m[2]?.trim() };
  }

  return rest ? { verb, target: rest } : { verb };
}
