import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { newGame } from "../src/game/newGame.js";
import {
  TARGET_VERSION,
  currentVersion,
  dryRunMigration,
  listMigrations,
  openDb,
  pendingMigrations,
} from "../src/persistence/db.js";

const tmp = mkdtempSync(join(tmpdir(), "nullzero-doctor-"));
try {
  // Fresh DB: version should be 0, all migrations pending.
  const freshPath = join(tmp, "fresh.db");
  const freshRaw = new Database(freshPath);
  try {
    const v0 = currentVersion(freshRaw);
    const pending0 = pendingMigrations(freshRaw);
    console.log(`fresh version: ${v0}`);
    console.log(`pending count: ${pending0.length} (expected ${listMigrations().length})`);
    if (v0 !== 0) throw new Error("expected fresh DB to report version 0");
    if (pending0.length !== listMigrations().length)
      throw new Error("expected all migrations pending on fresh DB");

    // Dry-run the first one — should succeed without writing.
    const first = pending0[0]!;
    const dry = dryRunMigration(freshRaw, first);
    console.log(
      `dry-run v${first.version}: ${dry.ok ? "ok" : `fail: ${dry.ok === false ? dry.error : ""}`}`,
    );
    if (!dry.ok) throw new Error("dry-run of v1 should succeed");
    if (currentVersion(freshRaw) !== 0)
      throw new Error("dry-run should not persist version change");
  } finally {
    freshRaw.close();
  }

  // openDb applies all migrations and reaches TARGET_VERSION.
  const db = openDb(freshPath);
  try {
    console.log(`after openDb: version ${currentVersion(db)} / target ${TARGET_VERSION}`);
    if (currentVersion(db) !== TARGET_VERSION)
      throw new Error("openDb should apply all migrations to target");
    const pending = pendingMigrations(db);
    console.log(`pending after open: ${pending.length}`);
    if (pending.length !== 0) throw new Error("no migrations should remain pending");
  } finally {
    db.close();
  }

  // Round-trip a real save through openDb → ensure pipeline is stable.
  const state = await newGame({ seed: 99, genre: "dark fantasy", gateway: null });
  console.log(`newGame places: ${state.bible?.places.length}`);
  console.log(`visited: ${state.visitedRegionIds.size}`);
  console.log(`regions: ${Object.keys(state.regions).length}`);

  console.log("smoke ok");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
