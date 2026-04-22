import type { LogEntry } from "../game/state.js";

export function wrapPlain(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const out: string[] = [];
  for (const segment of text.split("\n")) {
    if (segment.length === 0) {
      out.push("");
      continue;
    }
    const words = segment.split(/(\s+)/);
    let cur = "";
    for (const word of words) {
      if (cur.length + word.length <= width) {
        cur += word;
        continue;
      }
      if (cur.length > 0) {
        out.push(cur);
        cur = "";
      }
      let w = word.trimStart();
      while (w.length > width) {
        out.push(w.slice(0, width));
        w = w.slice(width);
      }
      cur = w;
    }
    if (cur.length > 0) out.push(cur);
  }
  return out.length > 0 ? out : [""];
}

export function renderLogTail(entries: LogEntry[], innerW: number, innerH: number): string {
  if (innerH <= 0 || innerW <= 0 || entries.length === 0) return "";
  const lines: string[] = [];
  let remaining = innerH;
  for (let i = entries.length - 1; i >= 0 && remaining > 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const color = entry.kind === "nudge" ? "magenta" : "white";
    const wrapped = wrapPlain(entry.text, innerW);
    // If a single entry alone overflows, keep its tail so the newest text stays visible.
    const keep = wrapped.length > remaining ? wrapped.slice(wrapped.length - remaining) : wrapped;
    for (let j = keep.length - 1; j >= 0; j--) {
      lines.push(`{${color}-fg}${keep[j]}{/}`);
    }
    remaining -= keep.length;
  }
  return lines.reverse().join("\n");
}
