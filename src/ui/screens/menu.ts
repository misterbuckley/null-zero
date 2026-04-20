import blessed from "neo-blessed";
import type { Widgets } from "blessed";

export interface MenuHandlers {
  onNewGame: () => void;
  onContinue: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export interface MenuOptions {
  saveCount: number;
}

const TITLE_ART = [
  "  ███╗   ██╗██╗   ██╗██╗     ██╗     ",
  "  ████╗  ██║██║   ██║██║     ██║     ",
  "  ██╔██╗ ██║██║   ██║██║     ██║     ",
  "  ██║╚██╗██║██║   ██║██║     ██║     ",
  "  ██║ ╚████║╚██████╔╝███████╗███████╗",
  "  ╚═╝  ╚═══╝ ╚═════╝ ╚══════╝╚══════╝",
  "             / /  z e r o",
].join("\n");

const TAGLINE = "a world that writes itself";

type MenuKey = "new" | "continue" | "settings" | "quit";

export function mountMenu(
  screen: Widgets.Screen,
  handlers: MenuHandlers,
  opts: MenuOptions,
): () => void {
  const continueLabel =
    opts.saveCount > 0
      ? `  Continue (${opts.saveCount})`.padEnd(14)
      : "  Continue    ";

  const items: { label: string; key: MenuKey; enabled: boolean }[] = [
    { label: "  New Game    ", key: "new", enabled: true },
    { label: continueLabel, key: "continue", enabled: opts.saveCount > 0 },
    { label: "  Settings    ", key: "settings", enabled: true },
    { label: "  Quit        ", key: "quit", enabled: true },
  ];

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 52,
    height: 20,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
  });

  blessed.text({
    parent: panel,
    top: 1,
    left: "center",
    width: "shrink",
    height: TITLE_ART.split("\n").length,
    content: TITLE_ART,
    tags: true,
    style: { fg: "cyan", bold: true },
  });

  blessed.text({
    parent: panel,
    top: 8,
    left: "center",
    width: "shrink",
    height: 1,
    content: `{grey-fg}${TAGLINE}{/grey-fg}`,
    tags: true,
  });

  const list = blessed.list({
    parent: panel,
    top: 10,
    left: "center",
    width: 20,
    height: items.length + 2,
    items: items.map((item) => item.label),
    keys: true,
    vi: true,
    mouse: false,
    tags: true,
    border: { type: "line" },
    style: {
      selected: { bg: "cyan", fg: "black", bold: true },
      item: { fg: "white" },
      border: { fg: "grey" },
    },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: "center",
    width: "shrink",
    height: 1,
    content: "{grey-fg}↑↓ move · enter select · ^C quit{/grey-fg}",
    tags: true,
  });

  const choose = (index: number) => {
    const chosen = items[index];
    if (!chosen || !chosen.enabled) return;
    switch (chosen.key) {
      case "new":
        handlers.onNewGame();
        break;
      case "continue":
        handlers.onContinue();
        break;
      case "settings":
        handlers.onSettings();
        break;
      case "quit":
        handlers.onQuit();
        break;
    }
  };

  list.on("select", (_item: unknown, index: number) => choose(index));
  list.key(["q"], () => handlers.onQuit());
  list.focus();

  screen.render();

  return () => {
    panel.destroy();
    screen.render();
  };
}
