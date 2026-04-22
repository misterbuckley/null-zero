import type { Widgets } from "blessed";
import blessed from "neo-blessed";

export interface HelpHandlers {
  onClose: () => void;
}

const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "movement",
    rows: [
      ["h j k l / arrows", "move west · south · north · east"],
      ["y u b n", "move diagonally (nw · ne · sw · se)"],
    ],
  },
  {
    title: "interaction",
    rows: [
      ["t", "talk to adjacent person"],
      ["g", "pick up item on this tile"],
      ["i", "open inventory"],
      [":", "free-text command (look, read, give…)"],
      ["S", "save"],
      ["?", "this help"],
      ["q / esc", "save and return to menu"],
    ],
  },
  {
    title: "inventory",
    rows: [
      ["j / k", "move selection"],
      ["d", "drop selected item"],
      ["i / esc", "close"],
    ],
  },
  {
    title: "dialog",
    rows: [
      ["enter", "send what you've typed"],
      ["goodbye / bye", "end the conversation"],
      ["esc", "leave (they remember the conversation so far)"],
    ],
  },
];

export function mountHelp(screen: Widgets.Screen, handlers: HelpHandlers): () => void {
  const lines: string[] = [];
  for (const section of SECTIONS) {
    lines.push(`{cyan-fg}{bold}${section.title}{/}`);
    for (const [keys, desc] of section.rows) {
      lines.push(`  {yellow-fg}${keys.padEnd(18)}{/}  ${desc}`);
    }
    lines.push("");
  }

  const content = lines.join("\n");
  const height = lines.length + 4;

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 70,
    height,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Help ",
    padding: { left: 1, right: 1 },
  });

  blessed.text({
    parent: panel,
    top: 0,
    left: 0,
    right: 0,
    height: lines.length,
    tags: true,
    content,
    style: { fg: "white", bg: "black" },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    content: "{grey-fg}esc or ? to close{/grey-fg}",
    tags: true,
  });

  const close = () => {
    screen.unkey("escape", close);
    screen.unkey("?", close);
    panel.destroy();
    screen.render();
    handlers.onClose();
  };

  screen.key("escape", close);
  screen.key("?", close);
  screen.render();

  return () => {
    screen.unkey("escape", close);
    screen.unkey("?", close);
    panel.destroy();
    screen.render();
  };
}
