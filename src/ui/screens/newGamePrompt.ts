import type { Widgets } from "blessed";
import blessed from "neo-blessed";

export interface NewGamePromptHandlers {
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function mountNewGamePrompt(
  screen: Widgets.Screen,
  handlers: NewGamePromptHandlers,
  errorMessage?: string,
): () => void {
  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 52,
    height: 10,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " New Game ",
  });

  blessed.text({
    parent: panel,
    top: 1,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "Name your adventure:",
    tags: true,
    style: { fg: "white" },
  });

  const input = blessed.textbox({
    parent: panel,
    top: 3,
    left: 1,
    width: "100%-3",
    height: 1,
    inputOnFocus: true,
    keys: true,
    mouse: false,
    tags: false,
    style: { fg: "white", bg: "blue" },
  });

  if (errorMessage) {
    blessed.text({
      parent: panel,
      top: 5,
      left: 1,
      width: "100%-3",
      height: 1,
      content: `{red-fg}${errorMessage}{/red-fg}`,
      tags: true,
    });
  }

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "{grey-fg}enter confirm · esc cancel{/grey-fg}",
    tags: true,
  });

  input.on("submit", (value: string | undefined) => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) {
      input.focus();
      return;
    }
    handlers.onConfirm(trimmed);
  });
  input.on("cancel", () => handlers.onCancel());

  input.focus();
  screen.render();

  return () => {
    panel.destroy();
    screen.render();
  };
}
