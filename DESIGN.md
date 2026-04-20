# Null/Zero — Design Document

> A single-player, terminal-based, AI-driven roguelike. The world is procedurally
> skeletoned and AI-flavored on first visit, then persisted forever. NPCs talk
> through an LLM. A hidden story bible drives revealed beats as the player
> explores.

---

## 1. Vision

Null/Zero is a Zork-meets-NetHack game where **the world is generated lazily by an LLM but becomes canon the moment it is observed**. The player picks a genre, drops into a seed region, and explores an effectively infinite world. NPCs, descriptions, and story beats are generated on demand but checked against a persistent fact database so the game never contradicts itself.

### Design pillars

1. **Everything observed is canon.** Once the AI describes a tavern keeper as one-eyed, he stays one-eyed. Persistence is the foundation, not a feature.
2. **AI is seasoning, not structure.** Procedural algorithms lay down bones (map shape, exits, encounter slots). The LLM fills slots with flavor. This keeps cost bounded and gameplay reliable.
3. **The player never sees the machinery.** No "generating…" spinners mid-sentence if we can help it. No exposed prompts. No breaking the fourth wall.
4. **Backend is swappable.** Claude is the primary target but the provider layer is abstracted. Users bring their own keys; local models (Ollama) are first-class.
5. **Terminal-native.** No web view shimmed into a terminal. Monospace, boxy, keyboard-driven, looks at home next to `htop` and `vim`.

### Non-goals (for v1)

- Multiplayer, persistent servers, or shared worlds.
- Graphical tiles, mouse-driven UI, or sound.
- Deep combat simulation or character-stat progression (hooks exist; depth does not).
- Mod support. Extensibility is an emergent property of a clean provider interface, not a user-facing feature.

---

## 2. Player Experience

### First-run flow

1. Launch → title screen with ASCII logo.
2. Menu: `New Game`, `Continue`, `Settings`, `Quit`.
3. `New Game` → save-slot name prompt → genre picker (fantasy, cyberpunk, post-apocalyptic, cosmic horror, noir, custom-freeform).
4. Loading screen (masked as "opening your eyes…") — backend generates the story bible and the starting region in parallel.
5. Intro: the game shows two or three sentences of narration, then drops you in the viewport with your `@`.

### Moment-to-moment

- Move with `hjkl` or arrow keys. Tiles scroll; narration log updates as you cross boundaries.
- Press `l` to look, `t` to talk (to any adjacent NPC), `g` to grab, `i` for inventory, `:` to drop into a free-text command line for things the keymap doesn't cover ("open the locket," "listen at the door"), `?` for help.
- Dialog opens a modal. NPCs stream their replies. `Esc` to leave; context stays in the NPC's memory.
- Autosave on region transition. Manual save with `S`. Quit with `Q` (prompts to save).

### Long arc

- Beats reveal gradually. A tavern rumor here, a burned letter there. The bible plot isn't spoon-fed — the player stumbles into it.
- A save is a campaign. Multiple slots, each a distinct world with its own genre and bible.

---

## 3. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | **Node.js ≥ 20** | TypeScript toolchain, mature ecosystem, `better-sqlite3` is excellent. |
| Language | **TypeScript** (strict) | Matches user's preference; catches schema drift early. |
| TUI | **neo-blessed** + **blessed-contrib** | Grid-native; great for roguelike rendering. See §3.1. |
| Persistence | **SQLite** via `better-sqlite3` | One file per save slot. Atomic writes, indexed queries, trivial to inspect. |
| AI abstraction | **Thin in-house adapter** over provider SDKs | Fewer deps than Vercel AI SDK; we only need three call shapes. |
| Provider SDKs | `@anthropic-ai/sdk`, `openai`, raw `fetch` for Ollama/OAI-compatible | Each adapter is ~100 lines. |
| Dev tooling | `tsx` for dev run, `esbuild` for release bundle | Fast iteration; single-file output. |
| Packaging | `@yao-pkg/pkg` (later) | Ship a single binary per platform for non-Node users. |
| Tests | `vitest` | Fast, TS-native. |
| Lint/format | `biome` | Single tool, no eslint/prettier split. |

### 3.1 Why neo-blessed over Ink

Ink (React-in-terminal) is ergonomic for forms and menus but reconciles on every state change — expensive when re-rendering a scrolling tile grid at 30+ fps. neo-blessed (the maintained fork of blessed) lets us draw the viewport imperatively into a `Box` widget and keeps menus/dialogs as widgets. blessed-contrib gives us minimap, gauges, and log widgets for free.

**Alternative worth keeping in mind:** if blessed proves too crusty, we could migrate menus to Ink while keeping a blessed `screen` for the viewport, since both can co-exist. Flag this as "revisit if the DX hurts."

---

## 4. High-Level Architecture

```
+----------------------------------------------------------+
|                     UI (blessed)                         |
|  screens: Menu, Game, Dialog, Inventory, Settings        |
+------+------------------------------------+--------------+
       |                                    |
       v                                    v
+-------------+                    +------------------+
|  Core loop  | <---- events ----> |  Story engine    |
|  (tick,     |                    |  (bible, beats,  |
|   input,    |                    |   reveal sched)  |
|   render)   |                    +------------------+
+------+------+                              |
       |                                     v
       v                             +------------------+
+-------------+     observes         |   AI gateway     |
|   World     | <------------------> | (provider-       |
|  (regions,  |                      |  agnostic calls) |
|   entities) |                      +--------+---------+
+------+------+                               |
       |                                      v
       v                             +------------------+
+-------------+                      |   Providers      |
| Persistence |                      | Anthropic / OAI  |
| (SQLite)    |                      | Ollama / OAI-cmp |
+-------------+                      +------------------+
```

**Event bus** is the spine. Subsystems emit and subscribe; nothing imports the concrete instance of another subsystem. This keeps save/replay tractable and makes the story engine's "listen for X" patterns clean.

---

## 5. Data Model

One SQLite file per save slot at `~/.null-zero/saves/<slot>.db`. Rough schema:

```sql
-- World structure
regions(id TEXT PK, name, genre, coord_x, coord_y, skeleton_json,
        description, tags_json, generated_at, seed)
tiles(region_id, x, y, glyph, passable, entity_id, PK(region_id, x, y))
exits(region_id, dir, to_region_id, PK(region_id, dir))

-- Entities in the world
entities(id TEXT PK, kind, region_id, x, y, name, description, state_json)
npcs(entity_id PK, persona_json, memory_summary, disposition)
items(entity_id PK, weight, properties_json)

-- Dialog & memory
dialog_turns(npc_id, turn_idx, role, content, ts, PK(npc_id, turn_idx))
events(id INTEGER PK, ts, type, region_id, summary, full_json)
facts(id INTEGER PK, subject, predicate, object, confidence,
      source_event_id, is_canon BOOL)

-- Story
story(singleton=1, bible_json, beats_json)
beats_state(beat_id PK, status, revealed_at, revealed_in_event_id)

-- Meta
settings(key PK, value_json)
meta(key PK, value)  -- genre, seed, created_at, last_played_at, playtime
```

Notes:

- `facts` is the **contradiction shield** (see §9). Cheap key-value triples indexed by subject.
- `events` is an append-only log; the narration system reads tail slices; the AI memory builder queries by region and recency.
- `skeleton_json` keeps the procedural shape so we can re-render without a round trip; `description` is the AI-flavored prose that's canon once written.

### Migrations

Use a simple numbered migration folder (`src/persistence/migrations/001_init.sql`, etc.) run on open. Every save records the schema version it was last opened with.

---

## 6. World Generation

### 6.1 Procedural skeleton (deterministic)

When the player crosses into an ungenerated region:

1. Seed = `hash(save_seed, region_coord)` → reproducible.
2. Pick a **biome template** based on adjacent regions and genre (forest, ruin, cave, street, building interior, void, etc.). Templates are hand-authored.
3. Run the template's algorithm:
   - Cellular automata for caves.
   - BSP for dungeons/buildings.
   - Drunkard's walk for organic wilderness.
   - Grid-and-roads for urban.
4. Template declares **slot counts** (e.g., "0–2 NPC slots, 1–3 feature slots, 0–1 exit on each side"). Slots are placed on passable tiles.
5. Exits wire up to neighbor regions lazily (a neighbor is only generated when crossed; stubs are held as "unexplored").

Output: `regions.skeleton_json` + `tiles` rows. No AI call yet.

### 6.2 AI flavor pass (stochastic, cached)

Immediately after the skeleton is built and before the player enters:

- One AI call, ~400 tokens out, given: genre, biome template, adjacent region summaries, active story beats that want "planting," and the slot manifest.
- Returns: region name, 2–4 sentence description, slot fills (NPC persona seeds, item names+flavor, feature descriptions).
- Written to DB. **Never regenerated.** The description is now canon.

If the AI call fails, fall back to a template-generated description ("A dim cave stretches in all directions") so the game never blocks on network errors.

### 6.3 Why this split

Pure-AI generation is expensive, slow, and prone to contradicting itself. Pure-procedural is cheap but boring. The split keeps latency bounded (one call per new region, not per tile) and cost predictable (rough ceiling: a few cents per hour of play on a mid-tier model).

---

## 7. Hidden Storyline

### 7.1 Story bible

Generated once at new-game time with a large (~1500-token-out) AI call:

```jsonc
{
  "logline": "...",
  "protagonist_hook": "...",
  "central_mystery": "...",
  "factions": [{ "name": "...", "agenda": "...", "secret": "..." }],
  "key_characters": [{ "name": "...", "role": "...", "hidden_truth": "..." }],
  "key_locations": [{ "kind": "...", "significance": "..." }],
  "beats": [
    {
      "id": "b01",
      "title": "The letter in the ashes",
      "preconditions": ["player_visited_biome:ruin", "player_talked_to_any"],
      "reveals": "fragment: the protagonist's sibling was not killed in the fire",
      "delivery_hints": ["found_document", "npc_rumor", "environmental"]
    }
    // ...5–10 beats, soft ordering
  ],
  "climax_conditions": ["beat:b08_revealed", "player_at_key_location:cathedral"],
  "ending_variants": [ /* 2–3 ending stubs, chosen by player alignment */ ]
}
```

Stored in `story.bible_json`. **Never shown to the player.** Stored in plaintext in the DB because (a) single-player, and (b) spoiling yourself by running `sqlite3` is a player's own business.

### 7.2 Beat reveal scheduler

A subsystem that listens to events. Each tick:

1. For each `pending` beat, evaluate preconditions against facts/events.
2. When a beat becomes eligible, push it onto a **"wants-to-plant" queue**.
3. Next AI generation call (region flavor, NPC dialog, found item) that has a compatible delivery hint gets the beat injected into its prompt context: _"If natural, reveal this beat: …"_.
4. When the output includes the reveal, mark the beat `revealed` and link the event.

This lets reveals feel organic — the NPC gossiping about the fire isn't a special story-mode NPC, just a regular NPC whose next prompt happened to carry the beat.

### 7.3 Fallback: nudge

If 20+ minutes pass without a reveal opportunity, the scheduler can create one (a wandering stranger, a weather event, a dream). Rate-limited so it doesn't feel deus-ex.

---

## 8. AI Gateway

### 8.1 Call tiers

| Tier | Used for | Latency budget | Model class |
|---|---|---|---|
| **Heavy** | Story bible, new-game intro | 10–30s acceptable | Top-tier (Opus, GPT-5, large local) |
| **Medium** | Region flavor, NPC first turn | 2–5s | Mid-tier (Sonnet, GPT-4o) |
| **Light** | NPC reply turns, intent parsing, fact extraction | < 1.5s; stream | Small (Haiku, GPT-4o-mini, 7B local) |

User can override per-tier in settings. Defaults assume Claude.

### 8.2 Provider interface

```ts
export interface AIProvider {
  id: "anthropic" | "openai" | "ollama" | "openai-compat";
  complete(req: CompletionReq): Promise<CompletionRes>;
  stream(req: CompletionReq): AsyncIterable<StreamChunk>;
}

export interface CompletionReq {
  tier: "heavy" | "medium" | "light";
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens: number;
  temperature?: number;
  jsonSchema?: object; // when we want structured output
  stop?: string[];
}
```

Each adapter is a file: `src/ai/providers/anthropic.ts`, `openai.ts`, `ollama.ts`, `openai-compat.ts`. The gateway picks one based on settings and translates.

### 8.3 Structured output

For bible/flavor/fact-extraction calls we need JSON. Strategy:

- Anthropic: tool-use with a required tool + schema.
- OpenAI: `response_format: json_schema`.
- Ollama / OAI-compat: JSON-mode where supported, else prompt with schema and validate + one retry.

All responses are Zod-validated before write. A validation failure is a loud log line and a fallback.

### 8.4 Caching

- **Prompt-level cache** where the provider supports it (Anthropic prompt caching, in particular — the system prompt + world rules can be a stable prefix).
- **Response cache** keyed by `hash(call_kind + context_digest)` for idempotent cases (flavor generation). Avoids re-billing when we retry a region after a crash.

---

## 9. Memory & Context Builder

Every AI call gets a context packet assembled by the memory subsystem:

1. **Always**: genre, global style guide, current region description, player's last 5 narrated events.
2. **For NPC calls**: NPC persona, running summary of their memory, last N dialog turns verbatim.
3. **For flavor calls**: adjacent region names/descriptions, exit directions, local events, beats wanting delivery.
4. **Fact retrieval**: the player's recent input is keyword-hashed; matching `facts` rows are appended as "you know the following to be true…".

### Contradiction shield

After each AI output:

- A cheap **light-tier call** extracts new factual claims as triples: `(subject, predicate, object)`.
- Each new triple is checked against existing canon.
- **Descriptive drift** (tavern keeper's eyes are "green" now, "emerald" earlier) → soft-merged, canonical wording kept.
- **Hard contradictions** ("NPC X is alive" vs previously "NPC X died") → reject output, retry once, else narrate ambiguously and don't canonize.

This won't catch everything. It catches enough to keep the world coherent on the axes players actually notice (names, states, relationships).

---

## 10. NPC Dialog

### 10.1 Persona

Generated at first encounter (medium-tier call) from: slot seed, region, genre, local events. Stored once, referenced forever.

```jsonc
{
  "name": "Halven Rook",
  "archetype": "disgraced priest",
  "voice": "archaic, hedging, occasional latin",
  "goals": ["regain his order's favor", "find his brother"],
  "secrets": ["he set the fire in the orphanage"],
  "disposition_toward_player": "guarded-curious"
}
```

### 10.2 Turn loop

```
player_input -> intent_parse (light) -> build_context (persona + last 10 turns + facts)
             -> stream reply (light) -> update NPC memory summary (light, async)
             -> extract facts (light, async) -> store
```

### 10.3 Memory compaction

After every ~10 turns, summarize the conversation down to a couple of sentences and drop older turns. The NPC "remembers the gist" without the prompt blowing up.

### 10.4 Wrapping up

A `goodbye` command, or the NPC's own sense that the conversation is done, closes the turn. Dialog doesn't loop forever — both player and NPC can exit.

---

## 11. TUI Layout

```
╔══════════════════════════════════════════════╦═══════════════╗
║                                              ║  Halven       ║
║                                              ║  HP: 12/12    ║
║              World viewport                  ║  Loc: Ashfen  ║
║              (centered on @)                 ║  Time: dusk   ║
║                                              ╠═══════════════╣
║                                              ║  Minimap      ║
║                                              ║   . . #       ║
║                                              ║   . @ .       ║
║                                              ║   # . .       ║
╠══════════════════════════════════════════════╩═══════════════╣
║ > You enter a smoke-dark chapel. A priest looks up.          ║
║ > The priest: "Strange hour for pilgrims."                   ║
║ > [t] talk  [l] look  [i] inventory  [:] command  [?] help   ║
╚══════════════════════════════════════════════════════════════╝
```

Modal overlays (drawn on top, dim background):

- **Dialog** — centered box with streamed NPC text and input line.
- **Inventory** — scrollable list, item detail on right.
- **Menu / Settings / Save slots** — simple lists with arrow navigation.

Color palette: low-saturation, terminal-default background, 16-color safe for maximum terminal compatibility; optional 256-color palette for richer themes.

---

## 12. Input Model

Hybrid per the user's choice:

| Keys | Action |
|---|---|
| `h j k l` / arrows / numpad | Move |
| `l` | Look at tile / nearest thing |
| `t` | Talk to adjacent NPC (opens dialog modal) |
| `g` | Grab / pick up |
| `d` | Drop |
| `i` | Inventory |
| `:` | Free-text command ("open the locket", "sing the old song") |
| `S` | Save |
| `Q` | Quit (prompts save) |
| `?` | Help / keymap |
| `Esc` | Close modal / cancel |

Free-text commands are parsed by a light-tier AI call with a strict schema:

```ts
{ verb: string, target?: string, instrument?: string, extra?: string }
```

The engine maps verbs to game actions where possible; otherwise, the command becomes narration-only ("You hum the tune. Nothing happens… or did something stir?").

---

## 13. Save / Load

- Slots live in `~/.null-zero/saves/`. Each is `<slot-name>.db`.
- Menu lists slots with name, genre, playtime, last-played.
- Autosave on region transition and every N minutes; manual on `S`.
- **Crash safety**: SQLite WAL mode; writes are atomic.
- **Export/import** trivial — the save _is_ a file. Copy, share, archive.

---

## 14. Settings

Global settings in `~/.null-zero/settings.json`; per-save overrides in the save DB's `settings` table.

```jsonc
{
  "providers": {
    "heavy":  { "provider": "anthropic", "model": "claude-opus-4-7" },
    "medium": { "provider": "anthropic", "model": "claude-sonnet-4-6" },
    "light":  { "provider": "anthropic", "model": "claude-haiku-4-5-20251001" }
  },
  "apiKeys": { "anthropic": "env:ANTHROPIC_API_KEY", "openai": "env:OPENAI_API_KEY" },
  "ollama":  { "baseUrl": "http://localhost:11434" },
  "ui":      { "theme": "default", "palette": "256" },
  "gameplay":{ "autosaveMinutes": 5, "narrativeVerbosity": "medium" }
}
```

API keys resolve from env vars by default (keeps secrets out of the file). The settings screen lets users paste keys, which we write encrypted-at-rest (OS keychain if available; plain file otherwise, with a warning).

---

## 15. MVP Scope (Vertical Slice)

The smallest playable Null/Zero:

- Main menu: new game, continue, settings, quit.
- Three preset genres. Custom-freeform deferred.
- One provider: Anthropic. Settings screen still shows the shape of multi-provider.
- 5×5 region grid around start, procedurally generated, AI-flavored.
- Move, look, grab, drop.
- Up to two NPCs per region with full dialog loop.
- One generated story bible with one beat wired to a concrete reveal.
- SQLite persistence with autosave + manual save + multi-slot menu.
- Settings screen for API key and model.

**Explicitly out of MVP:** combat, stats, leveling, alternate providers, full beat system (only 1 beat wired), item effects, day/night cycle, weather, crafting.

---

## 16. Project Layout

```
null-zero/
  src/
    main.ts                # entry; bootstraps screen + menu
    core/
      loop.ts              # tick loop
      events.ts            # event bus
      state.ts             # in-memory game state
    world/
      region.ts
      generator/
        cave.ts
        building.ts
        ...
      flavor.ts            # AI flavor pass
      entities.ts
    ai/
      gateway.ts           # tier → provider dispatch
      context.ts           # memory packet builder
      facts.ts             # extraction + contradiction check
      providers/
        anthropic.ts
        openai.ts
        ollama.ts
        openai-compat.ts
      schemas.ts           # zod schemas for structured outputs
    story/
      bible.ts             # generation
      beats.ts             # scheduler
    memory/
      events.ts
      facts.ts
    ui/
      app.ts               # blessed screen wiring
      screens/
        menu.ts
        game.ts
        dialog.ts
        inventory.ts
        settings.ts
      widgets/
        viewport.ts
        log.ts
        minimap.ts
    persistence/
      db.ts                # better-sqlite3 wrapper
      migrations/
        001_init.sql
      save.ts              # high-level save/load API
    config/
      settings.ts
  tests/
  saves/                   # gitignored
  package.json
  tsconfig.json
  biome.json
  DESIGN.md
  README.md
```

---

## 17. Milestones

| M | Deliverable | Demo |
|---|---|---|
| M0 | Scaffold: TS + blessed screen + menu | Launch app, see menu, arrow-navigate |
| M1 | Procedural region + render + movement | Wander a static genre-fantasy map |
| M2 | SQLite persistence + save/load + slots | Save, quit, restart, continue |
| M3 | AI gateway + Anthropic adapter | Call returns structured JSON |
| M4 | AI flavor pass on new regions | Cross into a region, read its generated description |
| M5 | NPC persona + dialog loop | Talk to a generated priest |
| M6 | Story bible + one wired beat | Bible generated at new-game; one reveal triggers |
| M7 | Genre picker + multi-slot polish | End-to-end happy path playable |
| M8 | Settings screen + second provider (Ollama) | Swap to local model mid-session |

Each milestone closes with an end-to-end run from the main menu. No long-lived feature branches.

---

## 18. Risks & Open Questions

| Risk | Mitigation |
|---|---|
| **Token cost** runs away on a long session | Tiered models; response caching; hard per-session budget with warning; local-model path as escape valve. |
| **Latency** kills the feel | Stream everything user-visible; pre-generate adjacent-region flavor in the background when the player is stationary. |
| **Contradictions** erode trust in the world | Facts extraction + hard-contradiction rejection; accept that soft drift is unavoidable and narrate around it. |
| **Story feels aimless** despite the bible | Beat scheduler with a fallback nudge after N minutes of no reveals. |
| **Terminal DX**: blessed is crusty | Scope UI to minimum widgets; carve escape hatch to migrate menus to Ink if needed. |
| **Save schema churns** during dev | Migrations from day one; bump version on every shape change; write a `nullzero doctor` CLI to inspect saves. |

### Open questions

- Do we want a **"pause world" button** during dialog, or is the world in lock-step with player turns anyway? (Leaning: turn-based, world pauses — MUDs have real-time pressure; roguelikes don't. Pick one pillar.)
- How do we handle the **first-launch key setup** when the user hasn't got an API key? (Leaning: default to an offline tutorial zone with pre-written content, then prompt for a key before leaving the starter region.)
- Should **save files be human-readable** (JSON) for moddability, at the cost of atomicity? (Leaning: no, keep SQLite; offer an `export` command later.)
- Custom-freeform genre: **guardrails** for AI-generated content the user might not want (violence, sexual content)? (Leaning: settings toggles feeding the system prompt; not a research problem.)

---

## 19. Next Steps

1. **Review this doc.** Decisions you want to revisit: flag them.
2. **Scaffold M0.** `pnpm init`, install deps, get a blessed window showing a menu.
3. **Pick the first genre template** to implement end-to-end (fantasy-low is the easiest bar for LLMs).
4. **Define the Anthropic adapter** interface so we can stub calls and develop offline.
