# Null/Zero

A single-player, terminal-based, AI-driven roguelike. The world is procedurally
skeletoned and AI-flavored on first visit, then persisted forever.

See [DESIGN.md](DESIGN.md) for the full design.

## Dev

```sh
npm install
npm run dev
```

Keys on the main menu: `↑` / `↓` to move, `Enter` to select, `Ctrl+C` to quit.

## Scripts

- `npm run dev` — run from source with `tsx`
- `npm run typecheck` — TypeScript check
- `npm run build` — compile to `dist/`
- `npm start` — run the built output
- `npm run lint` — biome lint
- `npm run format` — biome format
