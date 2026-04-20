export type TileKind = "floor" | "wall" | "void";

export interface Tile {
  readonly kind: TileKind;
}

export const WALL: Tile = { kind: "wall" };
export const FLOOR: Tile = { kind: "floor" };
export const VOID: Tile = { kind: "void" };

export function isPassable(tile: Tile | undefined): boolean {
  return tile?.kind === "floor";
}

export interface Glyph {
  ch: string;
  fg: string;
}

export function glyphOf(tile: Tile | undefined): Glyph {
  if (!tile) return { ch: " ", fg: "black" };
  switch (tile.kind) {
    case "wall":
      return { ch: "#", fg: "white" };
    case "floor":
      return { ch: "·", fg: "grey" };
    case "void":
      return { ch: " ", fg: "black" };
  }
}
