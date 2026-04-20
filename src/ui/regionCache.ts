import { type Region, tileAt } from "../world/region.js";
import { glyphOf } from "../world/tile.js";

export interface RegionCache {
  width: number;
  height: number;
  rows: string[];
  offsets: Uint32Array[];
}

export const PLAYER_GLYPH = "{cyan-fg}{bold}@{/}";

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
  playerX: number | null,
): string {
  const row = cache.rows[y];
  const off = cache.offsets[y];
  if (row === undefined || off === undefined) return "";

  const s = Math.max(0, startCol);
  const e = Math.min(cache.width, endCol);
  if (s >= e) return "";

  if (playerX !== null && playerX >= s && playerX < e) {
    const before = row.slice(off[s], off[playerX]);
    const after = row.slice(off[playerX + 1], off[e]);
    return before + PLAYER_GLYPH + after;
  }

  return row.slice(off[s], off[e]);
}
