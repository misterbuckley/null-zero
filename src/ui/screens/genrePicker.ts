import type { Widgets } from "blessed";
import blessed from "neo-blessed";

export interface GenrePickerHandlers {
  onSelect: (genre: string) => void;
  onCancel: () => void;
}

const GENRES: { label: string; value: string }[] = [
  { label: "Dark fantasy", value: "dark fantasy" },
  { label: "Cyberpunk", value: "cyberpunk" },
  { label: "Post-apocalyptic", value: "post-apocalyptic" },
  { label: "Cosmic horror", value: "cosmic horror" },
  { label: "Noir", value: "noir" },
];

export function mountGenrePicker(
  screen: Widgets.Screen,
  handlers: GenrePickerHandlers,
): () => void {
  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 44,
    height: GENRES.length + 6,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Choose a genre ",
  });

  const list = blessed.list({
    parent: panel,
    top: 1,
    left: 1,
    width: "100%-3",
    height: GENRES.length,
    items: GENRES.map((g) => `  ${g.label}`),
    keys: true,
    vi: true,
    mouse: false,
    tags: false,
    style: {
      selected: { bg: "cyan", fg: "black", bold: true },
      item: { fg: "white" },
    },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "{grey-fg}enter select · esc back{/grey-fg}",
    tags: true,
  });

  list.on("select", (_item: unknown, index: number) => {
    const g = GENRES[index];
    if (g) handlers.onSelect(g.value);
  });
  list.key(["escape"], () => handlers.onCancel());
  list.focus();

  screen.render();

  return () => {
    panel.destroy();
    screen.render();
  };
}
