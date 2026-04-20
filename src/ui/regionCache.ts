import { type Region, tileAt } from "../world/region.js";
import { glyphOf } from "../world/tile.js";

export interface RegionCache {
  width: number;
  height: number;
  rows: string[];
  offsets: Uint32Array[];
}

export const PLAYER_GLYPH = "{cyan-fg}{bold}@{/}";
export const NPC_GLYPH = "{yellow-fg}{bold}@{/}";

export interface Overlay {
  x: number;
  glyph: string;
}

export function buildRegionCache(region: Region): RegionCache {
  const rows: string[] = [];
  const offsets: Uint32Array[] = [];

  for (let y = 0; y < region.height; y++) {
    const parts: string[] = [];
    const rowOffsets = new Uint32Array(region.width + 1);
    let offset = 0;

    for (let x = 0; x < region.width; x++) {
      rowOffsets[x] = offset;
      const g = glyphOf(tileAt(region, x, y));
      const cell = `{${g.fg}-fg}${g.ch}{/}`;
      parts.push(cell);
      offset += cell.length;
    }
    rowOffsets[region.width] = offset;
    rows.push(parts.join(""));
    offsets.push(rowOffsets);
  }

  return { width: region.width, height: region.height, rows, offsets };
}

export function renderRow(
  cache: RegionCache,
  y: number,
  startCol: number,
  endCol: number,
  overlays: Overlay[],
): string {
  const row = cache.rows[y];
  const off = cache.offsets[y];
  if (row === undefined || off === undefined) return "";

  const s = Math.max(0, startCol);
  const e = Math.min(cache.width, endCol);
  if (s >= e) return "";

  const visible = overlays
    .filter((o) => o.x >= s && o.x < e)
    .sort((a, b) => a.x - b.x);

  if (visible.length === 0) return row.slice(off[s], off[e]);

  const out: string[] = [];
  let cursor = s;
  for (const o of visible) {
    if (o.x > cursor) out.push(row.slice(off[cursor], off[o.x]));
    out.push(o.glyph);
    cursor = o.x + 1;
  }
  if (cursor < e) out.push(row.slice(off[cursor], off[e]));
  return out.join("");
}
