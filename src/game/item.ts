import type { ItemShape } from "../ai/schemas.js";

export interface Item {
  id: string;
  regionId: string | null;
  x: number | null;
  y: number | null;
  shape: ItemShape;
  properties: Record<string, unknown>;
}

export function onGround(item: Item): boolean {
  return item.regionId !== null && item.x !== null && item.y !== null;
}

export function isCarried(item: Item): boolean {
  return item.regionId === null;
}

export function itemsAt(items: Item[], regionId: string, x: number, y: number): Item[] {
  return items.filter((i) => i.regionId === regionId && i.x === x && i.y === y);
}

export function carriedItems(items: Item[]): Item[] {
  return items.filter(isCarried);
}

export function pickUp(item: Item): void {
  item.regionId = null;
  item.x = null;
  item.y = null;
}

export function dropAt(item: Item, regionId: string, x: number, y: number): void {
  item.regionId = regionId;
  item.x = x;
  item.y = y;
}
