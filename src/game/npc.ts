import type { DialogAgenda, NpcPersona } from "../ai/schemas.js";

export interface DialogTurn {
  role: "player" | "npc";
  content: string;
  ts: number;
}

export interface Npc {
  id: string;
  regionId: string;
  x: number;
  y: number;
  persona: NpcPersona;
  memorySummary: string;
  turns: DialogTurn[];
  // Transient per-session dialog state. Not persisted to disk.
  agenda?: DialogAgenda | null;
  agendaTurnsUsed?: number;
  agendaClosed?: boolean;
}
