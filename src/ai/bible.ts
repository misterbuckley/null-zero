import type { Gateway } from "./gateway.js";
import { jsonComplete } from "./json.js";
import { type StoryBible, StoryBibleSchema } from "./schemas.js";

export interface BibleContext {
  genre: string;
}

export async function generateBible(gateway: Gateway, ctx: BibleContext): Promise<StoryBible> {
  const user = `
You are writing the hidden story bible for a new "${ctx.genre}" roguelike playthrough.
The player will never read this directly. It exists so the game can reveal beats gradually through NPCs, documents, and environmental detail.

Rules:
- The central mystery must be something a curious player could plausibly piece together over a session.
- Beats should be soft-ordered: earlier beats have easy preconditions (like 'dialog_turns>=3'), later beats require more.
- Preconditions MUST use only these forms: 'dialog_turns>=N', 'moves>=N', 'talked_to_any'.
- Use 'b01', 'b02', ... for beat ids.
- Keep every field concrete and specific. Names should sound like they belong to this genre. No generic placeholders.
- For at least one late beat, include 'action_hooks': 1–2 concrete actions the player could take (verbs: look, examine, read, use, give, open, close) on a plausible target. When the player performs that action, the beat pays off. Only use hooks for things that would naturally exist in the region — don't invent.
- The 'places' array must list 3–7 distinct locations that belong to this story. The first place is the player's starting location. Give each a unique id ('p01', 'p02', ...). Biome tags are limited to 'cave', 'ruin', 'street', 'tunnel', 'chamber'. NPCs and beats may gesture at these places, so they should feel like real somewheres, not blank set dressing.
  `.trim();

  return jsonComplete(
    gateway,
    {
      tier: "heavy",
      system: `You are a story architect for a "${ctx.genre}" game. You think in secrets, agendas, and things left unsaid. You write like Gene Wolfe, M. John Harrison, or Nicole Kornher-Stace — spare, oblique, dense with implication.`,
      messages: [{ role: "user", content: user }],
      maxTokens: 2000,
      temperature: 0.9,
    },
    StoryBibleSchema,
  );
}

export function fallbackBible(genre: string): StoryBible {
  const base: Record<string, StoryBible> = {
    "dark fantasy": {
      logline:
        "A lost sibling, believed dead in an orphanage fire, may still be alive beneath the city.",
      central_mystery:
        "Who set the fire at the Rookery orphanage, and why does the old priest still carry its key?",
      factions: [
        {
          name: "The Order of the Quiet Flame",
          agenda: "Reclaim the relic-keys scattered after the fire.",
          secret: "One of their own lit the match.",
        },
        {
          name: "The Underhand",
          agenda: "Sell the orphanage's records to the highest bidder.",
          secret: "They have the player's own name in those records.",
        },
      ],
      key_characters: [
        {
          name: "Halven Rook",
          role: "Disgraced priest who survived the fire.",
          hidden_truth: "He set the fire, believing it would save a child he could not reach.",
        },
        {
          name: "Miren",
          role: "The sibling the player believes dead.",
          hidden_truth: "Alive, taken by the Underhand, raised to forget.",
        },
      ],
      beats: [
        {
          id: "b00",
          title: "A name in the half-dark",
          preconditions: [],
          reveals:
            "The name Miren keeps surfacing in the player's thoughts, unbidden, tied to a child's hand they can almost remember letting go.",
          delivery_hints: ["dream", "npc_rumor"],
        },
        {
          id: "b01",
          title: "The smell of smoke",
          preconditions: ["dialog_turns>=3"],
          reveals:
            "There was a fire, years ago, at the Rookery orphanage. Many did not get out. The priest you're speaking to was there.",
          delivery_hints: ["npc_rumor"],
        },
        {
          id: "b02",
          title: "A name that should be dead",
          preconditions: ["dialog_turns>=8"],
          reveals:
            "Someone named Miren was seen in the city last winter. They should not have been alive to be seen.",
          delivery_hints: ["npc_rumor", "environmental"],
        },
        {
          id: "b03",
          title: "The key at his throat",
          preconditions: ["dialog_turns>=14"],
          reveals:
            "The pendant the priest keeps touching is a key. It opens a door under the orphanage ruin.",
          delivery_hints: ["npc_rumor", "environmental"],
          action_hooks: [{ verb: "examine", target: "brass pendant" }],
        },
      ],
      places: [
        {
          id: "p01",
          name: "The Ashened Crypt",
          description:
            "A low, damp vault beneath a half-collapsed chapel. Soot clings to the ceiling; the air tastes of old smoke.",
          biome: "cave",
        },
        {
          id: "p02",
          name: "The Rookery, burnt",
          description:
            "What remains of the orphanage: four blackened walls open to the sky, floorboards gnawed by rain.",
          biome: "ruin",
        },
        {
          id: "p03",
          name: "Under-market of bones",
          description:
            "A chain of tunnels where the city's dispossessed trade by candle. The walls are stacked skull-deep.",
          biome: "tunnel",
        },
      ],
    },
  };

  return (
    base[genre] ?? {
      logline: "A stranger carries an errand they cannot remember taking on.",
      central_mystery: "Who sent the player here, and what are they expected to do?",
      factions: [
        {
          name: "The Sending",
          agenda: "See the errand completed.",
          secret: "There is no errand. Only the sending.",
        },
      ],
      key_characters: [
        {
          name: "The first stranger",
          role: "The first person the player will speak to.",
          hidden_truth: "They have been sent, too, and do not remember it either.",
        },
      ],
      beats: [
        {
          id: "b00",
          title: "The sending, half-remembered",
          preconditions: [],
          reveals:
            "An instruction the player can almost recall being given, by a voice they cannot place, in a room they did not leave willingly.",
          delivery_hints: ["dream", "environmental"],
        },
        {
          id: "b01",
          title: "A shared forgetting",
          preconditions: ["dialog_turns>=3"],
          reveals:
            "Whoever you speak to cannot remember why they are here, either. It is not only you.",
          delivery_hints: ["npc_rumor"],
        },
        {
          id: "b02",
          title: "The shape of the errand",
          preconditions: ["dialog_turns>=8"],
          reveals:
            "Everyone sent here is carrying the same half-sentence, and none of them finish it.",
          delivery_hints: ["npc_rumor", "environmental"],
        },
      ],
      places: [
        {
          id: "p01",
          name: "The waiting chamber",
          description:
            "A low stone room with nothing in it but the sense that someone has been here recently and left in a hurry.",
          biome: "chamber",
        },
        {
          id: "p02",
          name: "The outer passage",
          description:
            "A corridor that curves both left and right past the chamber. The air moves — something breathes at its far end.",
          biome: "tunnel",
        },
        {
          id: "p03",
          name: "The quiet yard",
          description:
            "A courtyard half-reclaimed by weeds. Whatever was here has been gone long enough that the silence feels habitual.",
          biome: "ruin",
        },
      ],
    }
  );
}
