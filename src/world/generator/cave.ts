import { fillRegion, type Region, setTile, tileAt } from "../region.js";
import { randInt, type RNG } from "../rng.js";
import { FLOOR, type Tile, WALL } from "../tile.js";

export interface CaveOptions {
  width: number;
  height: number;
  initialWallChance?: number;
  smoothingPasses?: number;
  wallThreshold?: number;
}

export function generateCave(id: string, rng: RNG, opts: CaveOptions): Region {
  const { width, height } = opts;
  const initialWallChance = opts.initialWallChance ?? 0.45;
  const smoothingPasses = opts.smoothingPasses ?? 5;
  const wallThreshold = opts.wallThreshold ?? 5;

  const region: Region = {
    id,
    width,
    height,
    tiles: fillRegion(width, height, WALL),
    spawn: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      setTile(region, x, y, isBorder || rng() < initialWallChance ? WALL : FLOOR);
    }
  }

  for (let pass = 0; pass < smoothingPasses; pass++) {
    const next: Tile[] = new Array<Tile>(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const isBorder = x === 0 || y === 0 || x === width - 1 || y === height - 1;
        if (isBorder) {
          next[y * width + x] = WALL;
          continue;
        }
        const walls = countWallNeighbors(region, x, y);
        next[y * width + x] = walls >= wallThreshold ? WALL : FLOOR;
      }
    }
    region.tiles = next;
  }

  keepLargestFloorComponent(region);
  region.spawn = findSpawn(region, rng);

  return region;
}

function countWallNeighbors(region: Region, cx: number, cy: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const t = tileAt(region, cx + dx, cy + dy);
      if (!t || t.kind === "wall") count++;
    }
  }
  return count;
}

function keepLargestFloorComponent(region: Region): void {
  const { width, height } = region;
  const visited = new Uint8Array(width * height);
  let bestComponent: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (visited[start]) continue;
      const startTile = region.tiles[start];
      if (!startTile || startTile.kind !== "floor") {
        visited[start] = 1;
        continue;
      }

      const stack: number[] = [start];
      const component: number[] = [];
      while (stack.length > 0) {
        const idx = stack.pop()!;
        if (visited[idx]) continue;
        visited[idx] = 1;
        const t = region.tiles[idx];
        if (!t || t.kind !== "floor") continue;
        component.push(idx);
        const cy = Math.floor(idx / width);
        const cx = idx - cy * width;
        if (cx > 0) stack.push(idx - 1);
        if (cx < width - 1) stack.push(idx + 1);
        if (cy > 0) stack.push(idx - width);
        if (cy < height - 1) stack.push(idx + width);
      }

      if (component.length > bestComponent.length) bestComponent = component;
    }
  }

  const keep = new Set(bestComponent);
  for (let i = 0; i < region.tiles.length; i++) {
    const t = region.tiles[i];
    if (t?.kind === "floor" && !keep.has(i)) region.tiles[i] = WALL;
  }
}

function findSpawn(region: Region, rng: RNG): { x: number; y: number } {
  const floors: { x: number; y: number }[] = [];
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const t = tileAt(region, x, y);
      if (t?.kind === "floor") floors.push({ x, y });
    }
  }
  if (floors.length === 0) {
    return { x: Math.floor(region.width / 2), y: Math.floor(region.height / 2) };
  }
  return floors[randInt(rng, 0, floors.length)]!;
}
