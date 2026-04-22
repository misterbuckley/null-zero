import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import { fallbackAgenda, generateAgenda } from "../../ai/agenda.js";
import { type Affordances, DIALOG_CLOSE_MARKER, dialogTurn } from "../../ai/dialog.js";
import type { Gateway } from "../../ai/gateway.js";
import type { DialogAgenda } from "../../ai/schemas.js";
import { carriedItems, contentsOf, isContainer, isWorn, onGround } from "../../game/item.js";
import type { DialogTurn, Npc } from "../../game/npc.js";
import { type GameState, pushLog } from "../../game/state.js";
import { markRevealed, pickPlantableBeat } from "../../story/beats.js";

export interface DialogHandlers {
  onClose: (updated: Npc) => void;
}

export interface DialogOptions {
  npc: Npc;
  state: GameState;
  gateway: Gateway | null;
}

type KeyBinding = [string[], () => void];

export function mountDialog(
  screen: Widgets.Screen,
  opts: DialogOptions,
  handlers: DialogHandlers,
): () => void {
  const { npc } = opts;

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "80%",
    height: "80%",
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: ` ${npc.persona.name} — ${npc.persona.archetype} `,
  });

  const transcript = blessed.box({
    parent: panel,
    top: 0,
    left: 1,
    right: 1,
    bottom: 4,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: " ", style: { bg: "grey" } },
    style: { fg: "white", bg: "black" },
    mouse: false,
  });

  const input = blessed.textbox({
    parent: panel,
    bottom: 2,
    left: 1,
    right: 1,
    height: 1,
    inputOnFocus: true,
    keys: true,
    mouse: false,
    tags: false,
    style: { fg: "white", bg: "blue" },
  });

  const hint = blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    content: "{grey-fg}enter speak · esc leave · type goodbye to end{/grey-fg}",
    tags: true,
  });

  const working: Npc = { ...npc, turns: [...npc.turns] };
  let liveBuffer = "";
  let streaming = false;
  let closed = false;
  let conversationEnded = working.agendaClosed === true;
  let agendaLoaded = working.agenda != null;

  const setHint = (markup: string) => {
    hint.setContent(markup);
  };

  const setEndedUi = () => {
    conversationEnded = true;
    working.agendaClosed = true;
    input.style.bg = "black";
    input.style.fg = "grey";
    setHint(`{grey-fg}${working.persona.name} has said their piece. esc to leave.{/grey-fg}`);
  };

  const paint = () => {
    const blocks: string[] = [];
    blocks.push(`{grey-fg}${working.persona.appearance}{/}`);
    for (const turn of working.turns) blocks.push(renderTurn(turn, working.persona.name));
    if (streaming) {
      blocks.push(`{cyan-fg}{bold}${working.persona.name}{/}\n  ${liveBuffer}`);
    }
    if (conversationEnded && !streaming) {
      blocks.push(
        `{grey-fg}— ${working.persona.name} has nothing more to add. Press esc to leave.{/}`,
      );
    }
    transcript.setContent(blocks.join("\n\n"));
    transcript.setScrollPerc(100);
    screen.render();
  };

  if (conversationEnded) setEndedUi();
  paint();

  const close = () => {
    if (closed) return;
    closed = true;
    panel.destroy();
    screen.render();
    handlers.onClose(working);
  };

  const ensureAgenda = async (): Promise<DialogAgenda> => {
    if (working.agenda) return working.agenda;
    const ctx = {
      persona: working.persona,
      region: opts.state.region.flavor ?? null,
      genre: opts.state.genre,
      memorySummary: working.memorySummary,
      plantBeat: pickPlantableBeat(opts.state),
    };
    let agenda: DialogAgenda;
    if (opts.gateway) {
      try {
        agenda = await generateAgenda(opts.gateway, ctx);
      } catch {
        agenda = fallbackAgenda(ctx);
      }
    } else {
      agenda = fallbackAgenda(ctx);
    }
    working.agenda = agenda;
    working.agendaTurnsUsed = working.agendaTurnsUsed ?? 0;
    agendaLoaded = true;
    return agenda;
  };

  const submit = async (value: string | undefined) => {
    const text = (value ?? "").trim();
    input.clearValue();
    if (!text) {
      input.focus();
      screen.render();
      return;
    }
    if (streaming) {
      input.focus();
      return;
    }

    if (conversationEnded) {
      // They've closed. Player chose to linger; acknowledge it without another AI call.
      working.turns.push({ role: "player", content: text, ts: Date.now() });
      working.turns.push({
        role: "npc",
        content: `${working.persona.name} does not answer.`,
        ts: Date.now(),
      });
      paint();
      input.focus();
      return;
    }

    working.turns.push({ role: "player", content: text, ts: Date.now() });
    paint();

    if (text.toLowerCase() === "goodbye" || text.toLowerCase() === "bye") {
      working.turns.push({ role: "npc", content: "Go, then.", ts: Date.now() });
      setEndedUi();
      paint();
      input.focus();
      return;
    }

    streaming = true;
    liveBuffer = "";
    paint();

    const agenda = agendaLoaded ? (working.agenda ?? null) : await ensureAgenda();
    const turnsUsed = working.agendaTurnsUsed ?? 0;
    const stateSnapshot = syncNpcIntoState(opts.state, working);
    const beat = pickPlantableBeat(stateSnapshot);
    const affordances = buildAffordances(opts.state);

    try {
      for await (const chunk of dialogTurn(opts.gateway, {
        persona: working.persona,
        region: opts.state.region.flavor ?? null,
        genre: opts.state.genre,
        history: working.turns.slice(0, -1),
        memorySummary: working.memorySummary,
        playerInput: text,
        plantBeat: beat,
        affordances,
        agenda,
        turnsUsed,
      })) {
        if (chunk.kind === "delta" && chunk.text) {
          liveBuffer += chunk.text;
          paint();
        }
      }
    } catch (err) {
      if (liveBuffer.length === 0) {
        liveBuffer = `(the words don't come: ${(err as Error).message})`;
      }
    } finally {
      const raw = liveBuffer.trim();
      const { cleaned, closing } = splitCloseMarker(raw);
      streaming = false;
      liveBuffer = "";
      if (cleaned.length > 0) {
        working.turns.push({ role: "npc", content: cleaned, ts: Date.now() });
        working.agendaTurnsUsed = (working.agendaTurnsUsed ?? 0) + 1;
        if (beat) {
          markRevealed(opts.state, beat.id);
          pushLog(opts.state, "Something they just said lingers with you.");
        }
      }
      if (closing) setEndedUi();
      paint();
      input.focus();
    }
  };

  input.on("submit", (v: string | undefined) => {
    void submit(v);
  });
  input.on("cancel", () => {
    if (!streaming) close();
  });

  const bindings: KeyBinding[] = [
    [
      ["escape"],
      () => {
        if (!streaming) close();
      },
    ],
  ];
  for (const [keys, fn] of bindings) screen.key(keys, fn);

  input.focus();

  return () => {
    for (const [keys, fn] of bindings) {
      for (const key of keys) screen.unkey(key, fn);
    }
    if (!closed) {
      closed = true;
      panel.destroy();
      screen.render();
    }
  };
}

function splitCloseMarker(text: string): { cleaned: string; closing: boolean } {
  const idx = text.indexOf(DIALOG_CLOSE_MARKER);
  if (idx < 0) return { cleaned: text, closing: false };
  return { cleaned: text.slice(0, idx).trim(), closing: true };
}

function syncNpcIntoState(state: GameState, working: Npc): GameState {
  const idx = state.npcs.findIndex((n) => n.id === working.id);
  if (idx >= 0) state.npcs[idx] = working;
  return state;
}

function buildAffordances(state: GameState): Affordances {
  const regionId = state.region.id;
  const ground = state.items
    .filter((i) => onGround(i) && i.regionId === regionId)
    .map((i) => ({
      name: i.shape.name,
      description: i.shape.description,
      where: "ground" as const,
      container: isContainer(i) || undefined,
      contents: isContainer(i) ? contentsOf(state.items, i).map((c) => c.shape.name) : undefined,
    }));
  const carried = carriedItems(state.items).map((i) => ({
    name: i.shape.name,
    description: i.shape.description,
    where: "carried" as const,
    worn: isWorn(i) || undefined,
    container: isContainer(i) || undefined,
    contents: isContainer(i) ? contentsOf(state.items, i).map((c) => c.shape.name) : undefined,
  }));
  return {
    items: [...ground, ...carried],
    features: state.region.flavor?.notable_features ?? [],
  };
}

function renderTurn(turn: DialogTurn, npcName: string): string {
  if (turn.role === "player") {
    return `{yellow-fg}{bold}You{/}\n  ${turn.content}`;
  }
  return `{cyan-fg}{bold}${npcName}{/}\n  ${turn.content}`;
}
