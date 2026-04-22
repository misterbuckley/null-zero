import type { RegionFlavor, StoryBible } from "../ai/schemas.js";
import type { Region } from "../world/region.js";
import type { Item } from "./item.js";
import type { Npc } from "./npc.js";

export type LogKind = "note" | "nudge";

export interface LogEntry {
  ts: number;
  text: string;
  kind: LogKind;
}

export interface GameState {
  genre: string;
  region: Region;
  regions: Record<string, Region>;
  visitedRegionIds: Set<string>;
  player: { x: number; y: number };
  log: LogEntry[];
  npcs: Npc[];
  items: Item[];
  bible: StoryBible | null;
  revealedBeats: Set<string>;
  lastRevealAt: number;
  flavorPrefetch?: Record<string, RegionFlavor>;
}

const MAX_LOG = 200;

export function pushLog(state: GameState, text: string, kind: LogKind = "note"): void {
  state.log.push({ ts: Date.now(), text, kind });
  if (state.log.length > MAX_LOG) {
    state.log.splice(0, state.log.length - MAX_LOG);
  }
}

export function switchRegion(state: GameState, region: Region): void {
  state.regions[region.id] = region;
  state.region = region;
  state.visitedRegionIds.add(region.id);
}
