import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import type { Npc } from "../../game/npc.js";
import { type GameState, pushLog } from "../../game/state.js";
import type { SaveMeta } from "../../persistence/save.js";
import { tileAt } from "../../world/region.js";
import { isPassable } from "../../world/tile.js";
import { NPC_GLYPH, PLAYER_GLYPH, buildRegionCache, renderRow } from "../regionCache.js";
import { mountHelp } from "./help.js";

export interface GameSession {
  slot: SaveMeta;
  state: GameState;
}

export interface GameScreenHandlers {
  onExit: () => void;
  onSave: (session: GameSession) => void;
  onTalk: (session: GameSession, npc: Npc) => void;
}

type KeyBinding = [string[], () => void];

const MOVE_INTERVAL_MS = 50;
const AUTOSAVE_INTERVAL_MS = 60_000;

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
    label: ` ${session.slot.name} · ${state.genre}${state.region.flavor ? ` · ${state.region.flavor.name}` : ""} `,
  });

  const cache = buildRegionCache(state.region);
  let lastMoveAt = 0;
  let lastLogLength = -1;

  const render = () => {
    const innerW = Number(viewport.width) || 0;
    const innerH = Number(viewport.height) || 0;
    if (innerW <= 0 || innerH <= 0) return;

    const { region } = state;
    const px = state.player.x;
    const py = state.player.y;

    const camX = clamp(
      px - Math.floor(innerW / 2),
      0,
      Math.max(0, region.width - innerW),
    );
    const camY = clamp(
      py - Math.floor(innerH / 2),
      0,
      Math.max(0, region.height - innerH),
    );

    const lines: string[] = new Array(innerH);
    for (let row = 0; row < innerH; row++) {
      const y = camY + row;
      if (y < 0 || y >= region.height) {
        lines[row] = "";
        continue;
      }

      const overlays = [];
      for (const npc of state.npcs) {
        if (npc.y === y) overlays.push({ x: npc.x, glyph: NPC_GLYPH });
      }
      if (py === y) overlays.push({ x: px, glyph: PLAYER_GLYPH });

      lines[row] = renderRow(cache, y, camX, camX + innerW, overlays);
    }
    viewport.setContent(lines.join("\n"));

    if (state.log.length !== lastLogLength) {
      lastLogLength = state.log.length;
      const tail = state.log
        .slice(-5)
        .map((entry) => `{white-fg}${entry.text}{/}`);
      log.setContent(tail.join("\n"));
    }

    screen.render();
  };

  const attempt = (dx: number, dy: number) => {
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
    if (state.npcs.some((n) => n.x === nx && n.y === ny)) {
      pushLog(state, "Someone is standing there. Press t to speak.");
      render();
      return;
    }
    state.player.x = nx;
    state.player.y = ny;
    render();
  };

  const talk = () => {
    const npc = findAdjacentNpc();
    if (!npc) {
      pushLog(state, "No one is near enough to hear you.");
      render();
      return;
    }
    handlers.onTalk(session, npc);
  };

  const findAdjacentNpc = (): Npc | null => {
    const px = state.player.x;
    const py = state.player.y;
    let best: Npc | null = null;
    let bestDist = Infinity;
    for (const npc of state.npcs) {
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

  const exit = () => {
    if (unmountHelp) return;
    try {
      handlers.onSave(session);
    } catch {
      // silent
    }
    handlers.onExit();
  };

  let unmountHelp: (() => void) | null = null;
  const toggleHelp = () => {
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
    [["?"], toggleHelp],
    [["S"], manualSave],
    [["q", "escape"], exit],
  ];
  for (const [keys, fn] of bindings) screen.key(keys, fn);

  screen.on("resize", render);
  render();

  return () => {
    clearInterval(autosaveTimer);
    screen.removeListener("resize", render);
    for (const [keys, fn] of bindings) {
      for (const key of keys) screen.unkey(key, fn);
    }
    unmountHelp?.();
    unmountHelp = null;
    container.destroy();
    screen.render();
  };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
