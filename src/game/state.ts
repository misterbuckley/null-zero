import type { Region } from "../world/region.js";

export interface LogEntry {
  ts: number;
  text: string;
}

export interface GameState {
  genre: string;
  region: Region;
  player: { x: number; y: number };
  log: LogEntry[];
}

const MAX_LOG = 200;

export function pushLog(state: GameState, text: string): void {
  state.log.push({ ts: Date.now(), text });
  if (state.log.length > MAX_LOG) {
    state.log.splice(0, state.log.length - MAX_LOG);
  }
}
