import { FLOOR, type Tile, type TileKind, VOID, WALL, makeExit } from "../world/tile.js";

const KIND_TO_BYTE: Record<TileKind, number> = { void: 0, floor: 1, wall: 2, exit: 3 };

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
    tiles[i] = byteToTile(byte, i);
  }
  return tiles;
}

function byteToTile(byte: number, idx: number): Tile {
  switch (byte) {
    case 0:
      return VOID;
    case 1:
      return FLOOR;
    case 2:
      return WALL;
    case 3:
      // Placeholder; exitId is restored from exits metadata after decode.
      return makeExit("");
    default:
      throw new Error(`unknown tile byte: ${byte} at index ${idx}`);
  }
}
