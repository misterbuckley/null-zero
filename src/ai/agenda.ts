import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import {
  type DialogAgenda,
  DialogAgendaSchema,
  type NpcPersona,
  type RegionFlavor,
  type StoryBeat,
} from "./schemas.js";

export interface AgendaContext {
  persona: NpcPersona;
  region: RegionFlavor | null;
  genre: string;
  memorySummary: string;
  plantBeat?: StoryBeat | null;
}

export async function generateAgenda(gateway: Gateway, ctx: AgendaContext): Promise<DialogAgenda> {
  const { persona, region, genre, memorySummary, plantBeat } = ctx;

  const priorNote = memorySummary
    ? `Prior note about the player: ${memorySummary}`
    : "No prior history with this player.";
  const setting = region
    ? `Setting: ${region.name} — ${region.description}`
    : "Setting is unclear.";
  const plant = plantBeat
    ? `If it fits naturally, work this in, oblique as a rumor: ${plantBeat.reveals}`
    : "No specific beat needs landing this conversation.";

  const user = `
Write the hidden conversation plan for ${persona.name}, ${persona.archetype}, in a "${genre}" world.
Voice: ${persona.voice}.
Standing goals (background, not for this conversation): ${persona.goals.join("; ")}.
Disposition toward the stranger: ${persona.disposition}.
${setting}
${priorNote}
${plant}

Rules:
- driving_intent must be a single motive that fits THIS conversation — not their life plan.
- target_points are the 1–2 concrete things they want to say or learn before closing.
- max_turns is their patience for this exchange. A guarded or indifferent NPC should pick 2–3. A curious or lonely one 4–5. Rare cases 6.
  `.trim();

  return jsonComplete(
    gateway,
    {
      tier: "light",
      system:
        "You plan short, intentional conversations for NPCs in an atmospheric text game. Each plan is private — the NPC uses it to steer the talk and to know when they are done.",
      messages: [{ role: "user", content: user }],
      maxTokens: 300,
      temperature: 0.6,
    },
    DialogAgendaSchema,
  );
}

export function fallbackAgenda(ctx: AgendaContext): DialogAgenda {
  const { persona, plantBeat } = ctx;
  const first = persona.goals[0] ?? "say what must be said";
  const targetPoints: string[] = [`make the stranger understand: ${first}`];
  if (plantBeat) targetPoints.push(`hint at: ${plantBeat.reveals}`);
  const max = plantBeat ? 4 : 3;
  return {
    driving_intent: `${persona.name} wants the stranger to ${first} and then be done with them.`,
    target_points: targetPoints.slice(0, 2),
    max_turns: max,
  };
}
