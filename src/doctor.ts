import { existsSync, readdirSync } from "node:fs";
import Database from "better-sqlite3";
import {
  TARGET_VERSION,
  currentVersion,
  dryRunMigration,
  listMigrations,
  pendingMigrations,
} from "./persistence/db.js";
import { savesDir, slotPath } from "./persistence/paths.js";
import { loadSlot, readMeta } from "./persistence/save.js";

type Mode = "list" | "inspect" | "check" | "export" | "help";

interface ParsedArgs {
  mode: Mode;
  slug?: string;
}

export async function runDoctor(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  switch (args.mode) {
    case "help":
      printHelp();
      return 0;
    case "list":
      return cmdList();
    case "inspect":
      return cmdInspect(args.slug!);
    case "check":
      return cmdCheck(args.slug!);
    case "export":
      return cmdExport(args.slug!);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length === 0) return { mode: "list" };
  const first = argv[0]!;
  if (first === "--help" || first === "-h" || first === "help") return { mode: "help" };
  if (first === "list") return { mode: "list" };
  const slug = first;
  const flags = new Set(argv.slice(1));
  if (flags.has("--check")) return { mode: "check", slug };
  if (flags.has("--export")) return { mode: "export", slug };
  return { mode: "inspect", slug };
}

function printHelp(): void {
  const lines = [
    "nullzero doctor — inspect and validate Null/Zero saves",
    "",
    "usage:",
    "  doctor                   list all saves",
    "  doctor list              list all saves",
    "  doctor <slug>            inspect a save",
    "  doctor <slug> --check    dry-run any pending migrations",
    "  doctor <slug> --export   dump the save state as JSON",
    "  doctor help              show this help",
  ];
  console.log(lines.join("\n"));
}

function cmdList(): number {
  const dir = savesDir();
  if (!existsSync(dir)) {
    console.log("no saves directory.");
    return 0;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".db"));
  if (files.length === 0) {
    console.log("no saves found in", dir);
    return 0;
  }
  console.log(`schema target version: ${TARGET_VERSION}`);
  console.log(`saves in ${dir}:`);
  for (const file of files) {
    const slug = file.replace(/\.db$/, "");
    const p = slotPath(slug);
    const db = new Database(p, { readonly: true });
    try {
      const version = currentVersion(db);
      const meta = readMetaSafely(slug);
      const name = meta?.name ?? slug;
      const genre = meta?.genre ?? "?";
      const stale = version < TARGET_VERSION ? "  (migration pending)" : "";
      console.log(`  ${slug.padEnd(32)} v${version}  ${genre.padEnd(16)} ${name}${stale}`);
    } finally {
      db.close();
    }
  }
  return 0;
}

function readMetaSafely(slug: string): { name: string; genre: string } | null {
  try {
    const m = readMeta(slug);
    return m ? { name: m.name, genre: m.genre } : null;
  } catch {
    return null;
  }
}

function cmdInspect(slug: string): number {
  const p = slotPath(slug);
  if (!existsSync(p)) {
    console.error(`no save at ${p}`);
    return 1;
  }
  let state: ReturnType<typeof loadSlot>["state"];
  try {
    const loaded = loadSlot(slug);
    state = loaded.state;
    const meta = loaded.meta;
    console.log(`slot: ${meta.slug}`);
    console.log(`name: ${meta.name}`);
    console.log(`genre: ${meta.genre}`);
    console.log(`seed: ${meta.seed}`);
    console.log(`created: ${new Date(meta.createdAt).toISOString()}`);
    console.log(`last played: ${new Date(meta.lastPlayedAt).toISOString()}`);
    console.log(`played: ${formatMs(meta.playedMs)}`);
  } catch (err) {
    console.error(`failed to load save: ${(err as Error).message}`);
    return 1;
  }

  const db = new Database(p, { readonly: true });
  try {
    console.log(`schema version: ${currentVersion(db)} / target ${TARGET_VERSION}`);
  } finally {
    db.close();
  }

  const regionCount = Object.keys(state.regions).length;
  const visitedCount = state.visitedRegionIds.size;
  const itemsTotal = state.items.length;
  const itemsCarried = state.items.filter((i) => i.regionId === null).length;
  const itemsGround = itemsTotal - itemsCarried;
  const npcCount = state.npcs.length;
  const beats = state.bible?.beats.length ?? 0;
  const revealed = state.revealedBeats.size;
  const places = state.bible?.places.length ?? 0;
  const currentPlace = state.region.placeId ?? "—";
  const currentFlavor = state.region.flavor?.name ?? "—";

  console.log("");
  console.log(`regions: ${regionCount} total · ${visitedCount} visited`);
  console.log(`current region: ${state.region.id} (place ${currentPlace} · ${currentFlavor})`);
  console.log(`npcs: ${npcCount}`);
  console.log(`items: ${itemsTotal} (${itemsGround} on ground · ${itemsCarried} carried)`);
  console.log(`bible: ${state.bible ? "present" : "missing"}`);
  console.log(`places: ${places}`);
  console.log(`beats: ${revealed}/${beats} revealed`);
  if (state.revealedBeats.size > 0) {
    console.log(`  revealed: ${Array.from(state.revealedBeats).join(", ")}`);
  }

  console.log("");
  console.log("regions:");
  for (const region of Object.values(state.regions)) {
    const visited = state.visitedRegionIds.has(region.id) ? "visited" : "unseen ";
    const exits = region.exits?.length ?? 0;
    const name = region.flavor?.name ?? region.id;
    console.log(`  [${visited}] ${region.id.padEnd(28)} exits=${exits} ${name}`);
  }
  return 0;
}

function cmdCheck(slug: string): number {
  const p = slotPath(slug);
  if (!existsSync(p)) {
    console.error(`no save at ${p}`);
    return 1;
  }
  // Use a raw connection so openDb() does not auto-apply migrations.
  const db = new Database(p);
  try {
    const version = currentVersion(db);
    console.log(`slot: ${slug}`);
    console.log(`schema version: ${version} / target ${TARGET_VERSION}`);

    const pending = pendingMigrations(db);
    if (pending.length === 0) {
      console.log("no pending migrations.");
      return 0;
    }
    console.log(`${pending.length} pending migration(s):`);
    for (const m of pending) {
      console.log(`  v${m.version}: ${m.description}`);
    }

    // Dry-run the next migration only — later ones may depend on it.
    const next = pending[0]!;
    console.log(`\ndry-running v${next.version}...`);
    const result = dryRunMigration(db, next);
    if (!result.ok) {
      console.error(`  FAILED: ${result.error}`);
      return 2;
    }
    console.log(`  ok — v${next.version} would apply cleanly.`);
    console.log("  (nothing was written; re-open the save to apply.)");
    return 0;
  } finally {
    db.close();
  }
}

function cmdExport(slug: string): number {
  const p = slotPath(slug);
  if (!existsSync(p)) {
    console.error(`no save at ${p}`);
    return 1;
  }
  const { meta, state } = loadSlot(slug);
  const payload = {
    meta,
    state: {
      genre: state.genre,
      player: state.player,
      currentRegionId: state.region.id,
      visitedRegionIds: Array.from(state.visitedRegionIds),
      regions: Object.fromEntries(
        Object.entries(state.regions).map(([id, r]) => [
          id,
          {
            id: r.id,
            placeId: r.placeId,
            width: r.width,
            height: r.height,
            spawn: r.spawn,
            flavor: r.flavor,
            exits: r.exits,
          },
        ]),
      ),
      log: state.log,
      npcs: state.npcs,
      items: state.items,
      bible: state.bible,
      revealedBeats: Array.from(state.revealedBeats),
      lastRevealAt: state.lastRevealAt,
    },
    migrations: {
      target: TARGET_VERSION,
      all: listMigrations().map((m) => ({ version: m.version, description: m.description })),
    },
  };
  console.log(JSON.stringify(payload, null, 2));
  return 0;
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return `${h}h ${m}m ${rest}s`;
  if (m > 0) return `${m}m ${rest}s`;
  return `${rest}s`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await runDoctor(process.argv.slice(2));
  process.exit(code);
}
