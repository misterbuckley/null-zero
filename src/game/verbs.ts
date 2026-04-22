import type { Gateway } from "../ai/gateway.js";
import { narrateAction } from "../ai/narrate.js";
import type { ActionHook, Intent } from "../ai/schemas.js";
import { eligibleBeats, markRevealed } from "../story/beats.js";
import {
  type Item,
  carriedItems,
  containerIdOf,
  contentsOf,
  dropAt,
  isContainer,
  isWearable,
  isWorn,
  itemsAt,
  onGround,
  pickUp,
  setContainerId,
  setWorn,
} from "./item.js";
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
    case "take":
      return resolveTake(ctx);
    case "drop":
      return resolveDrop(ctx);
    case "put":
      return resolvePut(ctx);
    case "search":
      return resolveSearch(ctx);
    case "wait":
      return resolveWait(ctx);
    case "listen":
      return resolveSensory(ctx, "listen");
    case "smell":
      return resolveSensory(ctx, "smell");
    case "wear":
      return resolveWear(ctx);
    case "remove":
      return resolveRemoveWorn(ctx);
    case "combine":
      return resolveCombine(ctx);
    case "use":
      return resolveUse(ctx);
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
  if (item) {
    if (isContainer(item)) {
      const inside = contentsOf(state.items, item);
      if (inside.length === 0) {
        return `${item.shape.name}: ${item.shape.description} It is empty.`;
      }
      const names = inside.map((i) => i.shape.name).join(", ");
      return `${item.shape.name}: ${item.shape.description} Inside: ${names}.`;
    }
    return `${item.shape.name}: ${item.shape.description}`;
  }

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

  state.items = state.items.filter((it) => it.id !== item.id);
  const note = `player gave them ${item.shape.name}`;
  npc.memorySummary = npc.memorySummary ? `${npc.memorySummary}; ${note}` : note;

  return `You offer ${item.shape.name} to ${npc.persona.name}. ${npc.persona.name} takes it.`;
}

async function resolveTake(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  if (!target) {
    const here = itemsAt(state.items, state.region.id, state.player.x, state.player.y);
    if (here.length === 0) return "Nothing here to take.";
    const first = here[0]!;
    pickUp(first);
    return `You take ${first.shape.name}.`;
  }

  // "take X from Y" → intent.location is typically the container
  const fromName = (intent.location ?? intent.instrument ?? "").trim();
  if (fromName) {
    const container = matchItem(state, fromName);
    if (!container) return `No ${fromName} here to take from.`;
    if (!isContainer(container)) {
      return `${container.shape.name} is not something you can take anything out of.`;
    }
    const inside = contentsOf(state.items, container);
    const found = inside.find((it) => nameMatches(it.shape.name, target));
    if (!found) return `Nothing matching "${target}" inside ${container.shape.name}.`;
    setContainerId(found, null);
    pickUp(found);
    return `You take ${found.shape.name} out of ${container.shape.name}.`;
  }

  // Plain "take X" — from ground, player tile first then adjacent.
  const item = matchItem(state, target);
  if (!item) return `No "${target}" within reach.`;
  if (carriedItems(state.items).some((it) => it.id === item.id)) {
    return `You are already carrying ${item.shape.name}.`;
  }
  pickUp(item);
  return `You take ${item.shape.name}.`;
}

async function resolveDrop(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  if (!target) {
    const held = carriedItems(state.items);
    if (held.length === 0) return "You are carrying nothing.";
    const first = held[0]!;
    dropAt(first, state.region.id, state.player.x, state.player.y);
    setWorn(first, false);
    return `You drop ${first.shape.name}.`;
  }
  const item = carriedItems(state.items).find((it) => nameMatches(it.shape.name, target));
  if (!item) return `You are not carrying anything matching "${target}".`;
  dropAt(item, state.region.id, state.player.x, state.player.y);
  setWorn(item, false);
  return `You drop ${item.shape.name}.`;
}

async function resolvePut(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const instrument = (intent.instrument ?? intent.target ?? "").trim();
  const destName = (intent.location ?? "").trim();
  if (!instrument) return "The player wants to put something but did not name what.";
  if (!destName) return "Put it where? Name a container.";

  const item = carriedItems(state.items).find((it) => nameMatches(it.shape.name, instrument));
  if (!item) return `You are not carrying anything matching "${instrument}".`;

  const container = matchItem(state, destName);
  if (!container) return `No "${destName}" here to put anything into.`;
  if (!isContainer(container)) return `${container.shape.name} is not a container.`;
  if (container.id === item.id) return "You cannot put something into itself.";

  setWorn(item, false);
  setContainerId(item, container.id);
  return `You put ${item.shape.name} into ${container.shape.name}.`;
}

async function resolveSearch(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  if (!target) {
    return narrate(
      ctx,
      `The player searches the area around them. Here: [${visibleHere(state) || "—"}].`,
    );
  }
  const container = matchItem(state, target);
  if (container && isContainer(container)) {
    const inside = contentsOf(state.items, container);
    if (inside.length === 0) {
      return `You search ${container.shape.name}. Nothing inside.`;
    }
    return `You search ${container.shape.name}. Inside: ${inside
      .map((i) => i.shape.name)
      .join(", ")}.`;
  }
  return narrate(
    ctx,
    `The player searches "${target}". Keep the answer concrete: either a subtle detail they notice, or an honest nothing-found.`,
  );
}

async function resolveWait(ctx: ResolveContext): Promise<string> {
  return narrate(
    ctx,
    "The player waits, doing nothing for a beat. Describe what passes while they wait — 1–2 sentences.",
  );
}

async function resolveSensory(ctx: ResolveContext, sense: "listen" | "smell"): Promise<string> {
  const { state } = ctx;
  const flavor = state.region.flavor;
  if (!flavor) return narrate(ctx, `The player tries to ${sense} but the space is featureless.`);
  if (sense === "smell") {
    const scents = flavor.scents.join(", ");
    return narrate(
      ctx,
      `The player breathes in. Scents here: ${scents}. Weave one sentence of sensation.`,
    );
  }
  return narrate(
    ctx,
    `The player listens. Ambience: ${flavor.ambience}. Describe what they hear in 1–2 sentences — let at least one sound carry weight.`,
  );
}

async function resolveWear(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  if (!target) return "Wear what? Name a garment.";
  const item = carriedItems(state.items).find((it) => nameMatches(it.shape.name, target));
  if (!item) return `You are not carrying anything matching "${target}".`;
  if (!isWearable(item)) {
    return `${item.shape.name} is not something you can put on.`;
  }
  if (isWorn(item)) return `You are already wearing ${item.shape.name}.`;
  setWorn(item, true);
  return `You put on ${item.shape.name}.`;
}

async function resolveRemoveWorn(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const target = (intent.target ?? "").trim();
  const worn = carriedItems(state.items).filter(isWorn);
  if (worn.length === 0) return "You are not wearing anything removable.";
  const item = target ? worn.find((it) => nameMatches(it.shape.name, target)) : (worn[0] ?? null);
  if (!item) return `You are not wearing anything matching "${target}".`;
  setWorn(item, false);
  return `You take off ${item.shape.name}.`;
}

async function resolveCombine(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const aName = (intent.target ?? "").trim();
  const bName = (intent.instrument ?? intent.location ?? "").trim();
  if (!aName || !bName) return "Combine what with what?";
  const held = carriedItems(state.items);
  const a = held.find((it) => nameMatches(it.shape.name, aName));
  const b = held.find((it) => nameMatches(it.shape.name, bName) && it.id !== a?.id);
  if (!a || !b) {
    return "You need to be carrying both items to combine them.";
  }

  const artifact = findMatchingArtifact(state, a, b);
  if (!artifact) {
    return narrate(
      ctx,
      `The player tries to combine ${a.shape.name} with ${b.shape.name}. Nothing coheres — describe the failure in a single sentence, leaving both items unchanged.`,
    );
  }

  const result: Item = {
    id: `item-art-${state.region.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    regionId: null,
    x: null,
    y: null,
    shape: {
      name: artifact.name,
      description: artifact.description,
      kind: artifact.result_kind,
      tags: artifact.result_tags,
    },
    properties: {},
  };
  state.items = state.items.filter((it) => it.id !== a.id && it.id !== b.id);
  state.items.push(result);
  return `You combine ${a.shape.name} and ${b.shape.name}. Something new takes shape: ${artifact.name}. ${artifact.description}`;
}

function findMatchingArtifact(state: GameState, a: Item, b: Item) {
  const artifacts = state.bible?.artifacts ?? [];
  const tagsA = new Set(a.shape.tags.map((t) => t.toLowerCase()));
  const tagsB = new Set(b.shape.tags.map((t) => t.toLowerCase()));
  for (const art of artifacts) {
    const [ra, rb] = art.recipe_tags.map((t) => t.toLowerCase()) as [string, string];
    if ((tagsA.has(ra) && tagsB.has(rb)) || (tagsA.has(rb) && tagsB.has(ra))) {
      return art;
    }
  }
  return null;
}

async function resolveUse(ctx: ResolveContext): Promise<string> {
  const { state, intent } = ctx;
  const targetName = (intent.target ?? "").trim();
  const instrumentName = (intent.instrument ?? "").trim();

  // "use X on <exit|door|gate|way>" → try unlocking.
  if (instrumentName && looksLikeExitTarget(targetName)) {
    const exit = findLockedExit(state);
    if (exit) {
      return tryUnlock(ctx, exit, instrumentName);
    }
  }

  // "use X on <exit label>" — match against an exit label.
  if (instrumentName && targetName) {
    const exit = state.region.exits?.find((e) =>
      e.label ? e.label.toLowerCase().includes(targetName.toLowerCase()) : false,
    );
    if (exit?.lockTag) {
      return tryUnlock(ctx, exit, instrumentName);
    }
  }

  return narrate(ctx, describeSituation(ctx));
}

function looksLikeExitTarget(s: string): boolean {
  const lower = s.toLowerCase();
  return /\b(exit|door|gate|way|passage|opening|arch|portal|barrier)\b/.test(lower);
}

function findLockedExit(state: GameState) {
  return state.region.exits?.find((e) => !!e.lockTag) ?? null;
}

function tryUnlock(
  ctx: ResolveContext,
  exit: NonNullable<GameState["region"]["exits"]>[number],
  instrumentName: string,
): string {
  const { state } = ctx;
  const item = carriedItems(state.items).find((it) => nameMatches(it.shape.name, instrumentName));
  if (!item) return `You are not carrying anything matching "${instrumentName}".`;
  const tag = (exit.lockTag ?? "").toLowerCase();
  if (!item.shape.tags.map((t) => t.toLowerCase()).includes(tag)) {
    return `${item.shape.name} does not fit. The way remains barred.`;
  }
  exit.lockTag = undefined;
  return `${item.shape.name} fits. The way opens.`;
}

function matchAdjacentNpc(state: GameState, target: string): Npc | null {
  const lower = target.toLowerCase();
  const px = state.player.x;
  const py = state.player.y;
  for (const npc of state.npcs) {
    if (npc.regionId !== state.region.id) continue;
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
  const px = state.player.x;
  const py = state.player.y;
  const here = itemsAt(state.items, state.region.id, px, py);
  const adjacent = state.items.filter(
    (it) =>
      !containerIdOf(it) &&
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
    if (npc.regionId !== state.region.id) continue;
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
