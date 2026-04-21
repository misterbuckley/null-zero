import { FLOOR, type Tile, type TileKind, VOID, WALL } from "../world/tile.js";

const KIND_TO_BYTE: Record<TileKind, number> = { void: 0, floor: 1, wall: 2 };
const BYTE_TO_TILE: readonly Tile[] = [VOID, FLOOR, WALL];

export function encodeTiles(tiles: Tile[]): Buffer {
  const buf = Buffer.alloc(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    buf[i] = tile ? KIND_TO_BYTE[tile.kind] : 0;
  }
  return buf;
}

export function decodeTiles(buf: Buffer, expectedLength: number): Tile[] {
  if (buf.length !== expectedLength) {
    throw new Error(`tile buffer length mismatch: expected ${expectedLength}, got ${buf.length}`);
  }
  const tiles: Tile[] = new Array(expectedLength);
  for (let i = 0; i < expectedLength; i++) {
    const byte = buf[i] ?? 0;
    const tile = BYTE_TO_TILE[byte];
    if (!tile) throw new Error(`unknown tile byte: ${byte} at index ${i}`);
    tiles[i] = tile;
  }
  return tiles;
}
