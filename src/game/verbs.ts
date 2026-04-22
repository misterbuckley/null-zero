import type { Gateway } from "../ai/gateway.js";
import { narrateAction } from "../ai/narrate.js";
import type { ActionHook, Intent } from "../ai/schemas.js";
import { eligibleBeats, markRevealed } from "../story/beats.js";
import { type Item, carriedItems, itemsAt, onGround } from "./item.js";
import type { Npc } from "./npc.js";
import type { GameState } from "./state.js";

export interface ResolveContext {
  state: GameState;
  gateway: Gateway | null;
  intent: Intent;
  raw: string;
}

export async function resolveIntent(ctx: ResolveContext): Promise<string> {
  const { intent } = ctx;
  switch (intent.verb) {
    case "look":
    case "examine":
      return resolveLook(ctx);
    case "read":
      return resolveRead(ctx);
    case "give":
      return resolveGive(ctx);
    case "use":
    case "open":
    case "close":
    case "unknown":
      return narrate(ctx, describeSituation(ctx));
  }
}

async function resolveLook(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();

  if (!target) {
    const region = state.region.flavor;
    const notable = region?.notable_features?.slice(0, 2).join("; ") ?? "";
    const here = visibleHere(state);
    const parts = [
      region ? `${region.name}. ${region.description}` : "You take in your surroundings.",
      notable ? `You notice: ${notable}.` : "",
      here ? `Here: ${here}.` : "",
    ].filter(Boolean);
    return parts.join(" ");
  }

  const npc = matchAdjacentNpc(state, target);
  if (npc) return `${npc.persona.name}, ${npc.persona.archetype}. ${npc.persona.appearance}`;

  const item = matchItem(state, target);
  if (item) return `${item.shape.name}: ${item.shape.description}`;

  const feature = matchFeature(state, target);
  if (feature) return `You study ${feature}. It yields little more than its outline.`;

  return narrate(ctx, `The player is looking for "${target}" but nothing with that name is here.`);
}

async function resolveRead(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  if (!target) return narrate(ctx, "The player wants to read, but did not name anything.");

  const item = matchItem(state, target);
  if (!item) return narrate(ctx, `The player wants to read "${target}" but no such thing is here.`);

  const readable =
    item.shape.kind === "document" ||
    item.shape.tags.some((t) => ["readable", "paper", "inked", "marked"].includes(t));
  if (!readable) {
    return narrate(ctx, `The player tries to read ${item.shape.name} — it is not a document.`);
  }

  return narrate(
    ctx,
    `The player reads ${item.shape.name} (${item.shape.description}). Invent terse contents that feel inevitable given the setting. 1–2 sentences only.`,
  );
}

async function resolveGive(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const instrumentName = (intent.instrument ?? "").trim();
  const targetName = (intent.target ?? "").trim();

  if (!instrumentName) {
    return narrate(ctx, "The player wants to give something but did not name what.");
  }
  if (!targetName) {
    return narrate(ctx, "The player wants to give, but did not name a recipient.");
  }

  const item = carriedItems(state.items).find((it) => nameMatches(it.shape.name, instrumentName));
  if (!item) {
    return narrate(ctx, `The player is not carrying anything matching "${instrumentName}".`);
  }

  const npc = matchAdjacentNpc(state, targetName);
  if (!npc) {
    return narrate(ctx, `No one matching "${targetName}" is close enough to accept it.`);
  }

  // Hand the item to the NPC. They remember it.
  state.items = state.items.filter((it) => it.id !== item.id);
  const note = `player gave them ${item.shape.name}`;
  npc.memorySummary = npc.memorySummary ? `${npc.memorySummary}; ${note}` : note;

  return `You offer ${item.shape.name} to ${npc.persona.name}. ${npc.persona.name} takes it.`;
}

function matchAdjacentNpc(state: GameState, target: string): Npc | null {
  const lower = target.toLowerCase();
  const px = state.player.x;
  const py = state.player.y;
  for (const npc of state.npcs) {
    if (Math.abs(npc.x - px) > 1 || Math.abs(npc.y - py) > 1) continue;
    if (
      nameMatches(npc.persona.name, lower) ||
      nameMatches(npc.persona.archetype, lower) ||
      nameMatches("person", lower) ||
      nameMatches("them", lower) ||
      nameMatches("her", lower) ||
      nameMatches("him", lower)
    ) {
      return npc;
    }
  }
  return null;
}

function matchItem(state: GameState, target: string): Item | null {
  const lower = target.toLowerCase();
  // Prefer items on the player's tile, then adjacent, then carried, then anywhere in region.
  const px = state.player.x;
  const py = state.player.y;
  const here = itemsAt(state.items, state.region.id, px, py);
  const adjacent = state.items.filter(
    (it) =>
      it.regionId === state.region.id &&
      it.x !== null &&
      it.y !== null &&
      Math.abs(it.x - px) <= 1 &&
      Math.abs(it.y - py) <= 1,
  );
  const carried = carriedItems(state.items);
  const regionAll = state.items.filter((it) => onGround(it) && it.regionId === state.region.id);

  const order = [here, adjacent, carried, regionAll];
  for (const pool of order) {
    for (const item of pool) {
      if (nameMatches(item.shape.name, lower)) return item;
      if (item.shape.tags.some((t) => nameMatches(t, lower))) return item;
    }
  }
  return null;
}

function matchFeature(state: GameState, target: string): string | null {
  const lower = target.toLowerCase();
  const features = state.region.flavor?.notable_features ?? [];
  for (const f of features) {
    if (f.toLowerCase().includes(lower) || lower.includes(f.toLowerCase())) return f;
  }
  return null;
}

function visibleHere(state: GameState): string {
  const bits: string[] = [];
  const px = state.player.x;
  const py = state.player.y;
  const here = itemsAt(state.items, state.region.id, px, py);
  if (here.length) bits.push(here.map((i) => i.shape.name).join(", "));
  for (const npc of state.npcs) {
    if (Math.abs(npc.x - px) <= 1 && Math.abs(npc.y - py) <= 1) {
      bits.push(`${npc.persona.name} (${npc.persona.archetype})`);
    }
  }
  return bits.join("; ");
}

function nameMatches(name: string, query: string): boolean {
  if (!name || !query) return false;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n === q) return true;
  if (n.includes(q)) return true;
  if (q.includes(n)) return true;
  // word overlap
  const nWords = new Set(n.split(/[^a-z0-9]+/).filter(Boolean));
  for (const w of q.split(/[^a-z0-9]+/).filter(Boolean)) {
    if (nWords.has(w)) return true;
  }
  return false;
}

function describeSituation(ctx: ResolveContext): string {
  const { state, intent } = ctx;
  const parts = [
    `verb=${intent.verb}`,
    intent.target ? `target="${intent.target}"` : "",
    intent.instrument ? `instrument="${intent.instrument}"` : "",
    `here=[${visibleHere(state) || "—"}]`,
    `carrying=[${
      carriedItems(state.items)
        .map((i) => i.shape.name)
        .join(", ") || "—"
    }]`,
  ];
  return parts.filter(Boolean).join(", ");
}

async function narrate(ctx: ResolveContext, situation: string): Promise<string> {
  const text = await narrateAction(ctx.gateway, {
    genre: ctx.state.genre,
    region: ctx.state.region.flavor ?? null,
    intent: ctx.intent,
    raw: ctx.raw,
    situation,
  });
  return text.replace(/[{}]/g, "");
}

export function applyActionHooks(state: GameState, intent: Intent): string[] {
  const followUps: string[] = [];
  for (const beat of eligibleBeats(state)) {
    const hooks = beat.action_hooks ?? [];
    if (hooks.length === 0) continue;
    const matched = hooks.some((hook) => matchActionHook(hook, intent));
    if (!matched) continue;

    markRevealed(state, beat.id);
    followUps.push(`Something shifts into place. ${beat.reveals}`);
    const note = `the stranger acted on "${beat.title}"`;
    for (const npc of state.npcs) {
      if (npc.turns.length === 0) continue;
      npc.memorySummary = npc.memorySummary ? `${npc.memorySummary}; ${note}` : note;
    }
  }
  return followUps;
}

function matchActionHook(hook: ActionHook, intent: Intent): boolean {
  if (hook.verb !== intent.verb) return false;
  if (hook.target && !fieldMatches(hook.target, intent.target)) return false;
  if (hook.instrument && !fieldMatches(hook.instrument, intent.instrument)) return false;
  if (hook.location && !fieldMatches(hook.location, intent.location)) return false;
  return true;
}

function fieldMatches(hookField: string, intentField: string | undefined): boolean {
  if (!intentField) return false;
  return nameMatches(hookField, intentField) || nameMatches(intentField, hookField);
}
