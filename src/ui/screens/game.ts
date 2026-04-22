import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import { dropAt, itemsAt, pickUp } from "../../game/item.js";
import type { Npc } from "../../game/npc.js";
import { type GameState, pushLog } from "../../game/state.js";
import type { SaveMeta } from "../../persistence/save.js";
import { type NudgeCandidate, pickNudge } from "../../story/beats.js";
import { tileAt } from "../../world/region.js";
import { isPassable } from "../../world/tile.js";
import {
  ITEM_GLYPH,
  NPC_GLYPH,
  PLAYER_GLYPH,
  buildRegionCache,
  renderRow,
} from "../regionCache.js";
import { mountCommandPrompt } from "./commandPrompt.js";
import { mountHelp } from "./help.js";
import { mountInventory } from "./inventory.js";

export interface GameSession {
  slot: SaveMeta;
  state: GameState;
}

export interface GameScreenHandlers {
  onExit: () => void;
  onSave: (session: GameSession) => void;
  onTalk: (session: GameSession, npc: Npc) => void;
  onNudge: (session: GameSession, candidate: NudgeCandidate) => Promise<void>;
  onCommand: (session: GameSession, raw: string) => Promise<void>;
  onTravel: (session: GameSession, exitId: string) => Promise<void>;
  onMap: (session: GameSession) => void;
}

type KeyBinding = [string[], () => void];

const MOVE_INTERVAL_MS = 50;
const AUTOSAVE_INTERVAL_MS = 60_000;
const NUDGE_TICK_MS = 15_000;

export function mountGame(
  screen: Widgets.Screen,
  session: GameSession,
  handlers: GameScreenHandlers,
): () => void {
  const state = session.state;

  const container = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    style: { bg: "black" },
  });

  const viewport = blessed.box({
    parent: container,
    top: 0,
    left: 0,
    right: 0,
    height: "100%-7",
    tags: true,
    style: { bg: "black" },
  });

  const log = blessed.box({
    parent: container,
    left: 0,
    right: 0,
    bottom: 0,
    height: 7,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "grey" }, bg: "black" },
    padding: { left: 1, right: 1 },
    label: " ",
  });

  const updateLabel = () => {
    log.setLabel(
      ` ${session.slot.name} · ${state.genre}${state.region.flavor ? ` · ${state.region.flavor.name}` : ""} `,
    );
  };
  updateLabel();

  let cache = buildRegionCache(state.region);
  let lastMoveAt = 0;

  const refreshRegionCache = () => {
    cache = buildRegionCache(state.region);
    updateLabel();
  };

  const render = () => {
    const tail = state.log.slice(-5).map((entry) => {
      const color = entry.kind === "nudge" ? "magenta" : "white";
      return `{${color}-fg}${entry.text}{/}`;
    });
    log.setContent(tail.join("\n"));

    // Use screen dims (always resolved from stdout) rather than viewport.width,
    // which can be a raw "100%" string before blessed has laid out.
    const screenW = Number(screen.width) || 0;
    const screenH = Number(screen.height) || 0;
    const innerW = screenW;
    const innerH = Math.max(0, screenH - 7);
    if (innerW <= 0 || innerH <= 0) {
      screen.render();
      return;
    }

    const { region } = state;
    const px = state.player.x;
    const py = state.player.y;

    const camX = clamp(px - Math.floor(innerW / 2), 0, Math.max(0, region.width - innerW));
    const camY = clamp(py - Math.floor(innerH / 2), 0, Math.max(0, region.height - innerH));

    const lines: string[] = new Array(innerH);
    for (let row = 0; row < innerH; row++) {
      const y = camY + row;
      if (y < 0 || y >= region.height) {
        lines[row] = "";
        continue;
      }

      const byX = new Map<number, { glyph: string; priority: number }>();
      for (const item of state.items) {
        if (item.regionId !== region.id) continue;
        if (item.y !== y || item.x === null) continue;
        byX.set(item.x, { glyph: ITEM_GLYPH, priority: 1 });
      }
      for (const npc of state.npcs) {
        if (npc.regionId !== region.id) continue;
        if (npc.y === y) {
          const existing = byX.get(npc.x);
          if (!existing || existing.priority < 2) {
            byX.set(npc.x, { glyph: NPC_GLYPH, priority: 2 });
          }
        }
      }
      if (py === y) byX.set(px, { glyph: PLAYER_GLYPH, priority: 3 });
      const overlays = Array.from(byX.entries()).map(([x, v]) => ({ x, glyph: v.glyph }));

      lines[row] = renderRow(cache, y, camX, camX + innerW, overlays);
    }
    viewport.setContent(lines.join("\n"));
    screen.render();
  };

  const modalOpen = (): boolean =>
    unmountHelp !== null || unmountInventory !== null || unmountCommand !== null;

  const attempt = (dx: number, dy: number) => {
    if (modalOpen()) return;
    const now = Date.now();
    if (now - lastMoveAt < MOVE_INTERVAL_MS) return;
    lastMoveAt = now;

    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    const target = tileAt(state.region, nx, ny);
    if (!isPassable(target)) {
      pushLog(state, "You bump against stone.");
      render();
      return;
    }
    if (state.npcs.some((n) => n.regionId === state.region.id && n.x === nx && n.y === ny)) {
      pushLog(state, "Someone is standing there. Press t to speak.");
      render();
      return;
    }
    state.player.x = nx;
    state.player.y = ny;

    if (target?.kind === "exit" && target.exitId) {
      const exit = state.region.exits?.find((e) => e.id === target.exitId);
      if (exit) {
        pushLog(state, `${exit.label}...`);
        render();
        handlers
          .onTravel(session, exit.id)
          .then(() => {
            refreshRegionCache();
            render();
          })
          .catch((err: Error) => {
            pushLog(state, `(the passage falters: ${err.message})`);
            render();
          });
        return;
      }
    }
    render();
  };

  const talk = () => {
    if (modalOpen()) return;
    const npc = findAdjacentNpc();
    if (!npc) {
      pushLog(state, "No one is near enough to hear you.");
      render();
      return;
    }
    handlers.onTalk(session, npc);
  };

  const grab = () => {
    if (modalOpen()) return;
    const here = itemsAt(state.items, state.region.id, state.player.x, state.player.y);
    const target = here[0];
    if (!target) {
      pushLog(state, "Nothing here to pick up.");
      render();
      return;
    }
    pickUp(target);
    pushLog(state, `You pick up ${stripName(target.shape.name)}.`);
    render();
  };

  const openCommand = () => {
    if (modalOpen()) return;
    unmountCommand = mountCommandPrompt(screen, {
      onSubmit: (raw) => {
        unmountCommand?.();
        unmountCommand = null;
        pushLog(state, `> ${raw}`);
        render();
        handlers
          .onCommand(session, raw)
          .catch((err: Error) => {
            pushLog(state, `(the attempt falters: ${err.message})`);
          })
          .finally(() => render());
      },
      onCancel: () => {
        unmountCommand?.();
        unmountCommand = null;
        render();
      },
    });
  };

  const openInventory = () => {
    if (modalOpen()) return;
    unmountInventory = mountInventory(
      screen,
      { items: state.items },
      {
        onDrop: (item) => {
          dropAt(item, state.region.id, state.player.x, state.player.y);
          pushLog(state, `You drop ${stripName(item.shape.name)}.`);
        },
        onClose: () => {
          unmountInventory?.();
          unmountInventory = null;
          render();
        },
      },
    );
  };

  const findAdjacentNpc = (): Npc | null => {
    const px = state.player.x;
    const py = state.player.y;
    let best: Npc | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const npc of state.npcs) {
      if (npc.regionId !== state.region.id) continue;
      const dx = npc.x - px;
      const dy = npc.y - py;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) continue;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        best = npc;
        bestDist = d;
      }
    }
    return best;
  };

  const manualSave = () => {
    try {
      handlers.onSave(session);
      pushLog(state, "Saved.");
    } catch (err) {
      pushLog(state, `Save failed: ${(err as Error).message}`);
    }
    render();
  };

  const autosave = () => {
    try {
      handlers.onSave(session);
    } catch {
      // silent
    }
  };

  const autosaveTimer = setInterval(autosave, AUTOSAVE_INTERVAL_MS);

  let nudgeInFlight = false;
  const tickNudge = () => {
    if (nudgeInFlight) return;
    if (modalOpen()) return;
    const candidate = pickNudge(state);
    if (!candidate) return;
    nudgeInFlight = true;
    handlers
      .onNudge(session, candidate)
      .catch(() => {
        // silent — nudges are best-effort
      })
      .finally(() => {
        nudgeInFlight = false;
        render();
      });
  };
  const nudgeTimer = setInterval(tickNudge, NUDGE_TICK_MS);

  const exit = () => {
    if (modalOpen()) return;
    try {
      handlers.onSave(session);
    } catch {
      // silent
    }
    handlers.onExit();
  };

  let unmountHelp: (() => void) | null = null;
  let unmountInventory: (() => void) | null = null;
  let unmountCommand: (() => void) | null = null;
  const toggleHelp = () => {
    if (unmountInventory) return;
    if (unmountHelp) {
      unmountHelp();
      unmountHelp = null;
      return;
    }
    unmountHelp = mountHelp(screen, {
      onClose: () => {
        unmountHelp = null;
      },
    });
  };

  const bindings: KeyBinding[] = [
    [["h", "left"], () => attempt(-1, 0)],
    [["l", "right"], () => attempt(1, 0)],
    [["k", "up"], () => attempt(0, -1)],
    [["j", "down"], () => attempt(0, 1)],
    [["y"], () => attempt(-1, -1)],
    [["u"], () => attempt(1, -1)],
    [["b"], () => attempt(-1, 1)],
    [["n"], () => attempt(1, 1)],
    [["t"], talk],
    [["g"], grab],
    [["i"], openInventory],
    [[":"], openCommand],
    [["?"], toggleHelp],
    [["S"], manualSave],
    [
      ["M"],
      () => {
        if (modalOpen()) return;
        handlers.onMap(session);
      },
    ],
    [["q", "escape"], exit],
  ];
  for (const [keys, fn] of bindings) screen.key(keys, fn);

  screen.on("resize", render);
  render();
  // blessed computes layout during screen.render(); schedule a second pass
  // so the initial viewport paints once widths are known.
  setImmediate(render);

  return () => {
    clearInterval(autosaveTimer);
    clearInterval(nudgeTimer);
    screen.removeListener("resize", render);
    for (const [keys, fn] of bindings) {
      for (const key of keys) screen.unkey(key, fn);
    }
    unmountHelp?.();
    unmountHelp = null;
    unmountInventory?.();
    unmountInventory = null;
    unmountCommand?.();
    unmountCommand = null;
    container.destroy();
    screen.render();
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

function stripName(s: string): string {
  return s.replace(/[{}]/g, "");
}
