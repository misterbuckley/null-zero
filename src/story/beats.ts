import type { StoryBeat } from "../ai/schemas.js";
import type { GameState } from "../game/state.js";

export interface BeatMetrics {
  dialogTurns: number;
  moves: number;
  talkedToAny: boolean;
}

export const NUDGE_IDLE_MS = 5 * 60 * 1000;
export const NUDGE_HINTS = new Set(["dream", "environmental"]);

export type NudgeHint = "dream" | "environmental";

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

export function eligibleBeats(state: GameState): StoryBeat[] {
  if (!state.bible) return [];
  const metrics = computeMetrics(state);
  return state.bible.beats.filter(
    (beat) =>
      !state.revealedBeats.has(beat.id) &&
      beat.preconditions.every((p) => evalPrecondition(p, metrics)),
  );
}

export function markRevealed(state: GameState, beatId: string, now = Date.now()): void {
  state.revealedBeats.add(beatId);
  state.lastRevealAt = now;
}

export function pickNudgeHint(beat: StoryBeat): NudgeHint | null {
  for (const hint of beat.delivery_hints) {
    if (hint === "dream" || hint === "environmental") return hint;
  }
  return null;
}

export interface NudgeCandidate {
  beat: StoryBeat;
  hint: NudgeHint;
}

export function pickNudge(state: GameState, now = Date.now()): NudgeCandidate | null {
  if (now - state.lastRevealAt < NUDGE_IDLE_MS) return null;
  if (!state.bible) return null;
  const metrics = computeMetrics(state);
  for (const beat of state.bible.beats) {
    if (state.revealedBeats.has(beat.id)) continue;
    if (!beat.preconditions.every((p) => evalPrecondition(p, metrics))) continue;
    const hint = pickNudgeHint(beat);
    if (!hint) continue;
    return { beat, hint };
  }
  return null;
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
