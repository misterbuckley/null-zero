import blessed from "neo-blessed";
import { type Gateway, createGateway, hasUsableProvider } from "../ai/gateway.js";
import { heuristicIntent, parseIntent } from "../ai/intent.js";
import { generateNudge } from "../ai/nudge.js";
import { loadSettings } from "../config/settings.js";
import { carriedItems, onGround } from "../game/item.js";
import { newGame } from "../game/newGame.js";
import type { Npc } from "../game/npc.js";
import { pushLog } from "../game/state.js";
import { applyActionHooks, resolveIntent } from "../game/verbs.js";
import { slugify } from "../persistence/paths.js";
import { createSlot, listSaves, loadSlot, saveSlot, slotExists } from "../persistence/save.js";
import { type NudgeCandidate, markRevealed } from "../story/beats.js";
import { showLoading } from "./loading.js";
import { mountDialog } from "./screens/dialog.js";
import { type GameSession, mountGame } from "./screens/game.js";
import { mountGenrePicker } from "./screens/genrePicker.js";
import { mountMenu } from "./screens/menu.js";
import { mountNewGamePrompt } from "./screens/newGamePrompt.js";
import { mountSettings } from "./screens/settings.js";
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
      if (!hasUsableProvider(settings)) return null;
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
        onSettings: () => showSettings(),
        onQuit: quit,
      },
      { saveCount },
    );
  };

  const showSettings = (): void => {
    unmountCurrent?.();
    unmountCurrent = mountSettings(screen, {
      onClose: () => showMenu(),
    });
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
      onNudge: (s, candidate) => runNudge(s, candidate),
      onCommand: (s, raw) => runCommand(s, raw),
    });
  };

  const runCommand = async (session: GameSession, raw: string): Promise<void> => {
    const gateway = getGateway();
    const state = session.state;
    const parseCtx = {
      regionItems: state.items
        .filter((i) => onGround(i) && i.regionId === state.region.id)
        .map((i) => i.shape.name),
      carriedItems: carriedItems(state.items).map((i) => i.shape.name),
      adjacentNpcs: state.npcs
        .filter((n) => Math.abs(n.x - state.player.x) <= 1 && Math.abs(n.y - state.player.y) <= 1)
        .map((n) => `${n.persona.name} (${n.persona.archetype})`),
      regionFeatures: state.region.flavor?.notable_features ?? [],
    };

    const intent = gateway
      ? await parseIntent(gateway, raw, parseCtx).catch(() => heuristicIntent(raw))
      : heuristicIntent(raw);

    const message = await resolveIntent({ state, gateway, intent, raw });
    pushLog(state, message.replace(/[{}]/g, ""));

    for (const followUp of applyActionHooks(state, intent)) {
      pushLog(state, followUp.replace(/[{}]/g, ""));
    }

    try {
      saveSlot(session.slot.slug, state);
    } catch {
      // silent
    }
  };

  const runNudge = async (session: GameSession, candidate: NudgeCandidate): Promise<void> => {
    const text = await generateNudge(getGateway(), {
      beat: candidate.beat,
      hint: candidate.hint,
      genre: session.state.genre,
      region: session.state.region.flavor ?? null,
    });
    const safe = text.replace(/[{}]/g, "");
    pushLog(session.state, safe, "nudge");
    markRevealed(session.state, candidate.beat.id);
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
