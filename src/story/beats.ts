import type { StoryBeat } from "../ai/schemas.js";
import type { GameState } from "../game/state.js";

export interface BeatMetrics {
  dialogTurns: number;
  moves: number;
  talkedToAny: boolean;
}

export function computeMetrics(state: GameState): BeatMetrics {
  let dialogTurns = 0;
  let talkedToAny = false;
  for (const npc of state.npcs) {
    const player = npc.turns.filter((t) => t.role === "player").length;
    dialogTurns += player;
    if (player > 0) talkedToAny = true;
  }
  return { dialogTurns, moves: 0, talkedToAny };
}

export function pickPlantableBeat(state: GameState): StoryBeat | null {
  if (!state.bible) return null;
  const metrics = computeMetrics(state);
  for (const beat of state.bible.beats) {
    if (state.revealedBeats.has(beat.id)) continue;
    if (beat.preconditions.every((p) => evalPrecondition(p, metrics))) {
      return beat;
    }
  }
  return null;
}

export function markRevealed(state: GameState, beatId: string): void {
  state.revealedBeats.add(beatId);
}

function evalPrecondition(expr: string, m: BeatMetrics): boolean {
  const trimmed = expr.trim();
  if (trimmed === "talked_to_any") return m.talkedToAny;
  const match = trimmed.match(/^(dialog_turns|moves)\s*>=\s*(\d+)$/);
  if (!match) return false;
  const key = match[1];
  const n = Number(match[2]);
  if (Number.isNaN(n)) return false;
  if (key === "dialog_turns") return m.dialogTurns >= n;
  if (key === "moves") return m.moves >= n;
  return false;
}
