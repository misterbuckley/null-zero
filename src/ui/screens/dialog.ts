import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import { dialogTurn } from "../../ai/dialog.js";
import type { Gateway } from "../../ai/gateway.js";
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

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    content: "{grey-fg}enter speak · esc leave · type goodbye to end{/grey-fg}",
    tags: true,
  });

  const working = { ...npc, turns: [...npc.turns] };
  let liveBuffer = "";
  let streaming = false;
  let closed = false;

  const paint = () => {
    const blocks: string[] = [];
    blocks.push(`{grey-fg}${working.persona.appearance}{/}`);
    for (const turn of working.turns) blocks.push(renderTurn(turn, working.persona.name));
    if (streaming) {
      blocks.push(
        `{cyan-fg}{bold}${working.persona.name}{/}\n  ${liveBuffer}`,
      );
    }
    transcript.setContent(blocks.join("\n\n"));
    transcript.setScrollPerc(100);
    screen.render();
  };

  paint();

  const close = () => {
    if (closed) return;
    closed = true;
    panel.destroy();
    screen.render();
    handlers.onClose(working);
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

    working.turns.push({ role: "player", content: text, ts: Date.now() });
    paint();

    if (text.toLowerCase() === "goodbye" || text.toLowerCase() === "bye") {
      working.turns.push({ role: "npc", content: "Go, then.", ts: Date.now() });
      paint();
      setTimeout(close, 400);
      return;
    }

    streaming = true;
    liveBuffer = "";
    paint();

    const stateSnapshot = syncNpcIntoState(opts.state, working);
    const beat = pickPlantableBeat(stateSnapshot);

    try {
      for await (const chunk of dialogTurn(opts.gateway, {
        persona: working.persona,
        region: opts.state.region.flavor ?? null,
        genre: opts.state.genre,
        history: working.turns.slice(0, -1),
        memorySummary: working.memorySummary,
        playerInput: text,
        plantBeat: beat,
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
      const finalText = liveBuffer.trim();
      streaming = false;
      liveBuffer = "";
      if (finalText.length > 0) {
        working.turns.push({ role: "npc", content: finalText, ts: Date.now() });
        if (beat) {
          markRevealed(opts.state, beat.id);
          pushLog(opts.state, "Something they just said lingers with you.");
        }
      }
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
    [["escape"], () => { if (!streaming) close(); }],
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

function syncNpcIntoState(state: GameState, working: Npc): GameState {
  const idx = state.npcs.findIndex((n) => n.id === working.id);
  if (idx >= 0) state.npcs[idx] = working;
  return state;
}

function renderTurn(turn: DialogTurn, npcName: string): string {
  if (turn.role === "player") {
    return `{yellow-fg}{bold}You{/}\n  ${turn.content}`;
  }
  return `{cyan-fg}{bold}${npcName}{/}\n  ${turn.content}`;
}
