import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import type { SaveMeta } from "../../persistence/save.js";

export interface SlotPickerHandlers {
  onSelect: (slug: string) => void;
  onCancel: () => void;
}

function formatSlot(s: SaveMeta): string {
  const when = new Date(s.lastPlayedAt);
  const iso = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const name = truncate(s.name, 28).padEnd(28);
  return `  ${name}  ${iso}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function mountSlotPicker(
  screen: Widgets.Screen,
  slots: SaveMeta[],
  handlers: SlotPickerHandlers,
): () => void {
  const height = Math.max(10, Math.min(slots.length + 6, 20));
  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Continue ",
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "{grey-fg}enter load · esc cancel{/grey-fg}",
    tags: true,
  });

  if (slots.length === 0) {
    blessed.text({
      parent: panel,
      top: 2,
      left: "center",
      width: "shrink",
      height: 1,
      content: "{grey-fg}No saved games yet.{/grey-fg}",
      tags: true,
    });

    const keys = ["escape", "enter", "q", "space"];
    const onCancel = () => handlers.onCancel();
    for (const k of keys) screen.key(k, onCancel);
    screen.render();

    return () => {
      for (const k of keys) screen.unkey(k, onCancel);
      panel.destroy();
      screen.render();
    };
  }

  const list = blessed.list({
    parent: panel,
    top: 1,
    left: 1,
    width: "100%-3",
    height: height - 4,
    items: slots.map(formatSlot),
    keys: true,
    vi: true,
    mouse: false,
    tags: false,
    style: {
      selected: { bg: "cyan", fg: "black", bold: true },
      item: { fg: "white" },
    },
  });

  list.on("select", (_item: unknown, index: number) => {
    const slot = slots[index];
    if (slot) handlers.onSelect(slot.slug);
  });
  list.key(["escape"], () => handlers.onCancel());
  list.focus();

  screen.render();

  return () => {
    panel.destroy();
    screen.render();
  };
}
