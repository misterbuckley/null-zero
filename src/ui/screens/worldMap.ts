import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import type { Place } from "../../ai/schemas.js";
import type { GameState } from "../../game/state.js";

export interface WorldMapHandlers {
  onClose: () => void;
}

interface PlaceLine {
  place: Place;
  visited: boolean;
  current: boolean;
  connections: { toPlaceId: string; knownRegion: boolean }[];
}

export function mountWorldMap(
  screen: Widgets.Screen,
  state: GameState,
  handlers: WorldMapHandlers,
): () => void {
  const lines = buildLines(state);
  const rendered = renderLines(lines);

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 78,
    height: Math.min(screen.height ? Number(screen.height) - 4 : 40, rendered.length + 6),
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " World ",
    padding: { left: 2, right: 2, top: 1, bottom: 1 },
    keys: false,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
  });

  blessed.text({
    parent: panel,
    top: 0,
    left: 0,
    right: 0,
    height: rendered.length,
    tags: true,
    content: rendered.join("\n"),
    style: { fg: "white", bg: "black" },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    content: "{grey-fg}esc or M to close{/grey-fg}",
    tags: true,
  });

  const close = () => {
    screen.unkey("escape", close);
    screen.unkey("M", close);
    panel.destroy();
    screen.render();
    handlers.onClose();
  };

  screen.key("escape", close);
  screen.key("M", close);
  screen.render();

  return () => {
    screen.unkey("escape", close);
    screen.unkey("M", close);
    panel.destroy();
    screen.render();
  };
}

function buildLines(state: GameState): PlaceLine[] {
  const places = state.bible?.places ?? [];
  // Map placeId -> visitedRegion presence
  const visitedPlaceIds = new Set<string>();
  for (const id of state.visitedRegionIds) {
    const r = state.regions[id];
    if (r?.placeId) visitedPlaceIds.add(r.placeId);
  }
  const currentPlaceId = state.region.placeId ?? null;

  // Build a connections map by looking at all regions' exits.
  const adjacency = new Map<string, Map<string, boolean>>();
  for (const region of Object.values(state.regions)) {
    const fromPlace = region.placeId;
    if (!fromPlace) continue;
    const fromVisited = state.visitedRegionIds.has(region.id);
    if (!fromVisited) continue;
    for (const exit of region.exits ?? []) {
      addEdge(adjacency, fromPlace, exit.toPlaceId, !!exit.toRegionId);
    }
  }

  return places.map((place) => {
    const conns = adjacency.get(place.id);
    const connections = conns
      ? Array.from(conns.entries()).map(([toPlaceId, known]) => ({
          toPlaceId,
          knownRegion: known,
        }))
      : [];
    return {
      place,
      visited: visitedPlaceIds.has(place.id),
      current: place.id === currentPlaceId,
      connections,
    };
  });
}

function addEdge(
  map: Map<string, Map<string, boolean>>,
  from: string,
  to: string,
  known: boolean,
): void {
  if (!map.has(from)) map.set(from, new Map());
  const inner = map.get(from)!;
  const prev = inner.get(to) ?? false;
  inner.set(to, prev || known);
}

function renderLines(lines: PlaceLine[]): string[] {
  const out: string[] = [];
  for (const entry of lines) {
    const { place, visited, current, connections } = entry;
    if (visited) {
      const marker = current ? "{cyan-fg}●{/} " : "  ";
      const name = current ? `{cyan-fg}{bold}${place.name}{/}` : `{white-fg}${place.name}{/}`;
      out.push(`${marker}${name}`);
      out.push(`  {grey-fg}${place.description}{/}`);
      if (connections.length === 0) {
        out.push("  {grey-fg}no known paths outward{/}");
      } else {
        for (const conn of connections) {
          const dest = lines.find((l) => l.place.id === conn.toPlaceId);
          const destName = dest?.place.name ?? "somewhere";
          const destKnown = dest?.visited ?? false;
          const label = destKnown ? `{white-fg}${destName}{/}` : `{grey-fg}${destName} (unseen){/}`;
          out.push(`    → ${label}`);
        }
      }
    } else {
      out.push(`{grey-fg}  somewhere: ${place.name}{/}`);
      out.push("  {grey-fg}rumored only{/}");
    }
    out.push("");
  }
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}
