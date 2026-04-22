import type { RegionFlavor } from "../ai/schemas.js";
import type { Tile } from "./tile.js";

export interface RegionExit {
  id: string;
  x: number;
  y: number;
  toPlaceId: string;
  toRegionId: string | null;
  label: string;
}

export interface Region {
  id: string;
  placeId?: string;
  width: number;
  height: number;
  tiles: Tile[];
  spawn: { x: number; y: number };
  flavor?: RegionFlavor;
  exits?: RegionExit[];
}

export function tileAt(region: Region, x: number, y: number): Tile | undefined {
  if (x < 0 || y < 0 || x >= region.width || y >= region.height) return undefined;
  return region.tiles[y * region.width + x];
}

export function setTile(region: Region, x: number, y: number, tile: Tile): void {
  if (x < 0 || y < 0 || x >= region.width || y >= region.height) return;
  region.tiles[y * region.width + x] = tile;
}

export function fillRegion(width: number, height: number, tile: Tile): Tile[] {
  const tiles = new Array<Tile>(width * height);
  for (let i = 0; i < tiles.length; i++) tiles[i] = tile;
  return tiles;
}

export function findExitById(region: Region, exitId: string): RegionExit | null {
  return region.exits?.find((e) => e.id === exitId) ?? null;
}

export function findExitToPlace(region: Region, placeId: string): RegionExit | null {
  return region.exits?.find((e) => e.toPlaceId === placeId) ?? null;
}
