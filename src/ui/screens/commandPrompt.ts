import type { Widgets } from "blessed";
import blessed from "neo-blessed";

export interface CommandPromptHandlers {
  onSubmit: (raw: string) => void;
  onCancel: () => void;
}

export function mountCommandPrompt(
  screen: Widgets.Screen,
  handlers: CommandPromptHandlers,
): () => void {
  const panel = blessed.box({
    parent: screen,
    bottom: 1,
    left: 2,
    right: 2,
    height: 3,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " : ",
  });

  const input = blessed.textbox({
    parent: panel,
    top: 0,
    left: 1,
    right: 1,
    height: 1,
    inputOnFocus: true,
    keys: true,
    mouse: false,
    style: { fg: "white", bg: "black" },
  });

  input.on("submit", (value: string | undefined) => {
    const raw = (value ?? "").trim();
    if (!raw) {
      handlers.onCancel();
      return;
    }
    handlers.onSubmit(raw);
  });
  input.on("cancel", () => handlers.onCancel());

  input.focus();
  screen.render();

  return () => {
    panel.destroy();
    screen.render();
  };
}
