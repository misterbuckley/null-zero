import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import { type Item, carriedItems } from "../../game/item.js";

export interface InventoryHandlers {
  onDrop: (item: Item) => void;
  onClose: () => void;
}

export interface InventoryOptions {
  items: Item[];
}

type KeyBinding = [string[], () => void];

export function mountInventory(
  screen: Widgets.Screen,
  opts: InventoryOptions,
  handlers: InventoryHandlers,
): () => void {
  let items = carriedItems(opts.items);
  let selected = 0;

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: "80%",
    height: "70%",
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Inventory ",
  });

  const list = blessed.box({
    parent: panel,
    top: 0,
    left: 1,
    width: "40%",
    bottom: 1,
    tags: true,
    style: { fg: "white", bg: "black" },
  });

  const detail = blessed.box({
    parent: panel,
    top: 0,
    right: 1,
    width: "58%",
    bottom: 1,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    style: { fg: "white", bg: "black" },
  });

  const footer = blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    right: 1,
    height: 1,
    tags: true,
    content: "{grey-fg}j/k · move · d · drop · esc/i · close{/}",
  });
  void footer;

  const render = () => {
    if (items.length === 0) {
      list.setContent("{grey-fg}(carrying nothing){/}");
      detail.setContent("");
      screen.render();
      return;
    }

    if (selected >= items.length) selected = items.length - 1;
    if (selected < 0) selected = 0;

    const lines = items.map((it, i) => {
      const name = sanitize(it.shape.name);
      return i === selected ? `{cyan-fg}> ${name}{/}` : `  ${name}`;
    });
    list.setContent(lines.join("\n"));

    const current = items[selected];
    if (current) {
      const tags = current.shape.tags.length
        ? `{grey-fg}[${current.shape.tags.join(" · ")}]{/}`
        : "";
      detail.setContent(
        [
          `{bold}${sanitize(current.shape.name)}{/}`,
          `{grey-fg}${sanitize(current.shape.kind)}{/}`,
          "",
          sanitize(current.shape.description),
          "",
          tags,
        ].join("\n"),
      );
    }
    screen.render();
  };

  const move = (delta: number) => {
    if (items.length === 0) return;
    selected = (selected + delta + items.length) % items.length;
    render();
  };

  const drop = () => {
    const current = items[selected];
    if (!current) return;
    handlers.onDrop(current);
    // refresh from source (mutated in place)
    items = carriedItems(opts.items);
    render();
  };

  const close = () => {
    handlers.onClose();
  };

  const bindings: KeyBinding[] = [
    [["j", "down"], () => move(1)],
    [["k", "up"], () => move(-1)],
    [["d"], drop],
    [["i", "escape"], close],
  ];
  for (const [keys, fn] of bindings) screen.key(keys, fn);

  render();

  return () => {
    for (const [keys, fn] of bindings) {
      for (const key of keys) screen.unkey(key, fn);
    }
    panel.destroy();
    screen.render();
  };
}

function sanitize(s: string): string {
  return s.replace(/[{}]/g, "");
}
