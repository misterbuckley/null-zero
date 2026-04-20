import type { Widgets } from "blessed";
import blessed from "neo-blessed";

const FRAMES = ["   ", ".  ", ".. ", "..."];

export function showLoading(screen: Widgets.Screen, message: string): () => void {
  const box = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: Math.max(message.length + 10, 30),
    height: 5,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black", fg: "white" },
    padding: { left: 1, right: 1 },
  });

  let frame = 0;
  const paint = () => {
    box.setContent(`\n  {cyan-fg}${message}{/}${FRAMES[frame % FRAMES.length]}`);
    screen.render();
    frame++;
  };

  paint();
  const timer = setInterval(paint, 300);

  return () => {
    clearInterval(timer);
    box.destroy();
    screen.render();
  };
}
