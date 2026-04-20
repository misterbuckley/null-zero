import blessed from "neo-blessed";
import { createGateway, type Gateway } from "../ai/gateway.js";
import { loadSettings } from "../config/settings.js";
import { newGame } from "../game/newGame.js";
import { slugify } from "../persistence/paths.js";
import {
  createSlot,
  listSaves,
  loadSlot,
  saveSlot,
  slotExists,
} from "../persistence/save.js";
import type { Npc } from "../game/npc.js";
import { showLoading } from "./loading.js";
import { mountDialog } from "./screens/dialog.js";
import { type GameSession, mountGame } from "./screens/game.js";
import { mountGenrePicker } from "./screens/genrePicker.js";
import { mountMenu } from "./screens/menu.js";
import { mountNewGamePrompt } from "./screens/newGamePrompt.js";
import { mountSlotPicker } from "./screens/slotPicker.js";

export interface App {
  run(): void;
}

export function createApp(): App {
  const screen = blessed.screen({
    smartCSR: true,
    title: "Null/Zero",
    fullUnicode: true,
    autoPadding: true,
    warnings: false,
  });

  let unmountCurrent: (() => void) | null = null;

  const quit = () => {
    unmountCurrent?.();
    screen.destroy();
    process.exit(0);
  };

  screen.key(["C-c"], quit);

  const showNotImplemented = (label: string) => {
    const note = blessed.message({
      parent: screen,
      top: "center",
      left: "center",
      width: "shrink",
      height: "shrink",
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      border: { type: "line" },
      style: { border: { fg: "yellow" }, fg: "white" },
      tags: true,
    });
    note.display(`{yellow-fg}${label}{/} is not wired up yet.`, 2, () => {
      note.destroy();
      screen.render();
    });
  };

  const showError = (message: string) => {
    const note = blessed.message({
      parent: screen,
      top: "center",
      left: "center",
      width: "shrink",
      height: "shrink",
      padding: { left: 2, right: 2, top: 1, bottom: 1 },
      border: { type: "line" },
      style: { border: { fg: "red" }, fg: "white" },
      tags: true,
    });
    note.display(`{red-fg}${message}{/}`, 3, () => {
      note.destroy();
      screen.render();
    });
  };

  const getGateway = (): Gateway | null => {
    try {
      const settings = loadSettings();
      if (!settings.apiKeys.anthropic) return null;
      return createGateway(settings);
    } catch {
      return null;
    }
  };

  const showMenu = (): void => {
    unmountCurrent?.();
    let saveCount = 0;
    try {
      saveCount = listSaves().length;
    } catch {
      // silent
    }
    unmountCurrent = mountMenu(
      screen,
      {
        onNewGame: () => showNewGamePrompt(),
        onContinue: () => showContinue(),
        onSettings: () => showNotImplemented("Settings"),
        onQuit: quit,
      },
      { saveCount },
    );
  };

  const showNewGamePrompt = (errorMessage?: string): void => {
    unmountCurrent?.();
    unmountCurrent = mountNewGamePrompt(
      screen,
      {
        onConfirm: (name) => {
          if (slotExists(name)) {
            showNewGamePrompt(`A save named "${slugify(name)}" already exists.`);
            return;
          }
          showGenrePicker(name);
        },
        onCancel: () => showMenu(),
      },
      errorMessage,
    );
  };

  const showGenrePicker = (name: string): void => {
    unmountCurrent?.();
    unmountCurrent = mountGenrePicker(screen, {
      onSelect: (genre) => {
        void startFresh(name, genre);
      },
      onCancel: () => showNewGamePrompt(),
    });
  };

  const startFresh = async (name: string, genre: string): Promise<void> => {
    unmountCurrent?.();
    const gateway = getGateway();
    const dismiss = showLoading(
      screen,
      gateway ? "The world takes shape" : "Building a world (offline)",
    );
    try {
      const seed = (Date.now() & 0xffffffff) >>> 0;
      const state = await newGame({ seed, genre, gateway });
      const meta = createSlot(name, seed, state);
      dismiss();
      startGame({ slot: meta, state });
    } catch (err) {
      dismiss();
      showError((err as Error).message);
      showMenu();
    }
  };

  const showContinue = (): void => {
    unmountCurrent?.();
    let slots = [] as ReturnType<typeof listSaves>;
    try {
      slots = listSaves();
    } catch (err) {
      showError((err as Error).message);
      showMenu();
      return;
    }
    unmountCurrent = mountSlotPicker(screen, slots, {
      onSelect: (slug) => {
        try {
          const { meta, state } = loadSlot(slug);
          startGame({ slot: meta, state });
        } catch (err) {
          showError(`Load failed: ${(err as Error).message}`);
          showMenu();
        }
      },
      onCancel: () => showMenu(),
    });
  };

  const startGame = (session: GameSession): void => {
    unmountCurrent?.();
    unmountCurrent = mountGame(screen, session, {
      onExit: () => showMenu(),
      onSave: (s) => saveSlot(s.slot.slug, s.state),
      onTalk: (s, npc) => showDialog(s, npc),
    });
  };

  const showDialog = (session: GameSession, npc: Npc): void => {
    unmountCurrent?.();
    unmountCurrent = mountDialog(
      screen,
      {
        npc,
        state: session.state,
        gateway: getGateway(),
      },
      {
        onClose: (updated) => {
          const idx = session.state.npcs.findIndex((n) => n.id === updated.id);
          if (idx >= 0) session.state.npcs[idx] = updated;
          try {
            saveSlot(session.slot.slug, session.state);
          } catch {
            // silent
          }
          startGame(session);
        },
      },
    );
  };

  return {
    run() {
      showMenu();
      screen.render();
    },
  };
}
