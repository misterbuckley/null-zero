import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = join(homedir(), ".null-zero");

export function savesDir(): string {
  const dir = join(ROOT, "saves");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function slotPath(slug: string): string {
  return join(savesDir(), `${slug}.db`);
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "unnamed";
}
