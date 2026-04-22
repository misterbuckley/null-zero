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
  return item.regionId !== null && item.x !== null && item.y !== null && !containerIdOf(item);
}

export function isCarried(item: Item): boolean {
  return item.regionId === null && !containerIdOf(item);
}

export function itemsAt(items: Item[], regionId: string, x: number, y: number): Item[] {
  return items.filter(
    (i) => !containerIdOf(i) && i.regionId === regionId && i.x === x && i.y === y,
  );
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
  setContainerId(item, null);
}

export function isContainer(item: Item): boolean {
  if (item.shape.kind === "container") return true;
  return item.shape.tags.includes("container");
}

export function isWearable(item: Item): boolean {
  if (item.shape.kind === "garment") return true;
  const wearableTags = ["wearable", "worn", "pendant", "ring", "cloak", "amulet", "ward"];
  return item.shape.tags.some((t) => wearableTags.includes(t));
}

export function isWorn(item: Item): boolean {
  return item.properties.worn === true;
}

export function setWorn(item: Item, worn: boolean): void {
  item.properties.worn = worn ? true : undefined;
}

export function containerIdOf(item: Item): string | null {
  const raw = item.properties.containerId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function setContainerId(item: Item, containerId: string | null): void {
  if (containerId) {
    item.properties.containerId = containerId;
    item.regionId = null;
    item.x = null;
    item.y = null;
  } else {
    item.properties.containerId = undefined;
  }
}

export function contentsOf(items: Item[], container: Item): Item[] {
  return items.filter((i) => containerIdOf(i) === container.id);
}
