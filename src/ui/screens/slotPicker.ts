import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import { type SaveMeta, deleteSlot } from "../../persistence/save.js";

export interface SlotPickerHandlers {
  onSelect: (slug: string) => void;
  onCancel: () => void;
}

function formatSlot(s: SaveMeta): string {
  const name = truncate(s.name, 20).padEnd(20);
  const genre = truncate(s.genre, 14).padEnd(14);
  const last = relativeTime(s.lastPlayedAt);
  const play = formatDuration(s.playedMs);
  return `  ${name}  ${genre}  ${last.padStart(10)}  ${play.padStart(6)}`;
}

function relativeTime(ts: number): string {
  if (!ts) return "—";
  const delta = Date.now() - ts;
  if (delta < 60_000) return "just now";
  const mins = Math.floor(delta / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hours}h` : `${hours}h${rem}m`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

export function mountSlotPicker(
  screen: Widgets.Screen,
  initialSlots: SaveMeta[],
  handlers: SlotPickerHandlers,
): () => void {
  let slots = [...initialSlots];

  const height = Math.max(12, Math.min(slots.length + 8, 22));
  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 78,
    height,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Continue ",
  });

  blessed.text({
    parent: panel,
    top: 1,
    left: 1,
    width: "100%-3",
    height: 1,
    content: `  ${"name".padEnd(20)}  ${"genre".padEnd(14)}  ${"last played".padStart(10)}  ${"time".padStart(6)}`,
    tags: false,
    style: { fg: "grey" },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "{grey-fg}enter load · d delete · esc cancel{/grey-fg}",
    tags: true,
  });

  const listHeight = height - 5;

  if (slots.length === 0) {
    blessed.text({
      parent: panel,
      top: 3,
      left: "center",
      width: "shrink",
      height: 1,
      content: "{grey-fg}No saved games yet. Press esc to go back.{/grey-fg}",
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
    top: 2,
    left: 1,
    width: "100%-3",
    height: listHeight,
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

  const selectedIndex = (): number => {
    const raw = (list as unknown as { selected?: number }).selected;
    return typeof raw === "number" ? raw : 0;
  };

  const confirmDelete = (slot: SaveMeta) => {
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 50,
      height: 7,
      tags: true,
      border: { type: "line" },
      style: { border: { fg: "red" }, bg: "black" },
      label: " Delete save? ",
    });

    blessed.text({
      parent: modal,
      top: 1,
      left: 1,
      width: "100%-3",
      height: 2,
      content: `Delete "${truncate(slot.name, 30)}"?\n{grey-fg}This cannot be undone.{/grey-fg}`,
      tags: true,
    });

    blessed.text({
      parent: modal,
      bottom: 0,
      left: 1,
      width: "100%-3",
      height: 1,
      content: "{grey-fg}y delete · n or esc cancel{/grey-fg}",
      tags: true,
    });

    const cleanup = () => {
      screen.unkey("y", onYes);
      for (const k of ["n", "escape"]) screen.unkey(k, onNo);
      modal.destroy();
      screen.render();
      list.focus();
    };
    const onYes = () => {
      try {
        deleteSlot(slot.slug);
      } catch {
        // silent
      }
      slots = slots.filter((s) => s.slug !== slot.slug);
      list.setItems(slots.map(formatSlot));
      if (slots.length === 0) {
        cleanup();
        handlers.onCancel();
        return;
      }
      cleanup();
    };
    const onNo = () => cleanup();

    screen.key(["y"], onYes);
    screen.key(["n", "escape"], onNo);
    screen.render();
  };

  list.on("select", (_item: unknown, index: number) => {
    const slot = slots[index];
    if (slot) handlers.onSelect(slot.slug);
  });
  const onEscape = () => handlers.onCancel();
  const onDelete = () => {
    const slot = slots[selectedIndex()];
    if (slot) confirmDelete(slot);
  };
  list.key(["escape"], onEscape);
  list.key(["d"], onDelete);
  list.focus();

  screen.render();

  return () => {
    list.unkey("escape", onEscape);
    list.unkey("d", onDelete);
    panel.destroy();
    screen.render();
  };
}
