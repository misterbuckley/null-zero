import type { Widgets } from "blessed";
import blessed from "neo-blessed";
import type { ProviderId, Tier } from "../../ai/types.js";
import { type Settings, loadSettings, saveSettings } from "../../config/settings.js";

export interface SettingsHandlers {
  onClose: () => void;
}

const PROVIDER_CYCLE: ProviderId[] = ["anthropic", "ollama"];

type RowKey =
  | { kind: "provider"; tier: Tier }
  | { kind: "model"; tier: Tier }
  | { kind: "anthropicKey" }
  | { kind: "ollamaUrl" };

interface Row {
  key: RowKey;
  label: string;
  describe: (s: Settings) => string;
  editable: "text" | "cycle";
}

const ROWS: Row[] = [
  {
    key: { kind: "provider", tier: "heavy" },
    label: "Heavy provider",
    describe: (s) => s.providers.heavy.provider,
    editable: "cycle",
  },
  {
    key: { kind: "model", tier: "heavy" },
    label: "Heavy model",
    describe: (s) => s.providers.heavy.model,
    editable: "text",
  },
  {
    key: { kind: "provider", tier: "medium" },
    label: "Medium provider",
    describe: (s) => s.providers.medium.provider,
    editable: "cycle",
  },
  {
    key: { kind: "model", tier: "medium" },
    label: "Medium model",
    describe: (s) => s.providers.medium.model,
    editable: "text",
  },
  {
    key: { kind: "provider", tier: "light" },
    label: "Light provider",
    describe: (s) => s.providers.light.provider,
    editable: "cycle",
  },
  {
    key: { kind: "model", tier: "light" },
    label: "Light model",
    describe: (s) => s.providers.light.model,
    editable: "text",
  },
  {
    key: { kind: "anthropicKey" },
    label: "Anthropic API key",
    describe: (s) => describeKey(s.apiKeys.anthropic, s.apiKeySource.anthropic),
    editable: "text",
  },
  {
    key: { kind: "ollamaUrl" },
    label: "Ollama base URL",
    describe: (s) => s.ollama.baseUrl,
    editable: "text",
  },
];

function describeKey(key: string | undefined, source: "env" | "stored" | "none"): string {
  if (!key) return "(not set)";
  const masked = `****${key.slice(-4)}`;
  if (source === "env") return `${masked} (from env)`;
  return masked;
}

function nextProvider(current: ProviderId): ProviderId {
  const i = PROVIDER_CYCLE.indexOf(current);
  return PROVIDER_CYCLE[(i + 1) % PROVIDER_CYCLE.length] ?? current;
}

export function mountSettings(screen: Widgets.Screen, handlers: SettingsHandlers): () => void {
  const settings = loadSettings();
  let dirty = false;

  const panel = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 72,
    height: ROWS.length + 7,
    tags: true,
    border: { type: "line" },
    style: { border: { fg: "cyan" }, bg: "black" },
    label: " Settings ",
  });

  const list = blessed.list({
    parent: panel,
    top: 1,
    left: 1,
    width: "100%-3",
    height: ROWS.length,
    items: renderItems(settings),
    keys: true,
    vi: true,
    mouse: false,
    tags: true,
    style: {
      selected: { bg: "cyan", fg: "black", bold: true },
      item: { fg: "white" },
    },
  });

  const status = blessed.text({
    parent: panel,
    bottom: 2,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "",
    tags: true,
    style: { fg: "grey" },
  });

  blessed.text({
    parent: panel,
    bottom: 0,
    left: 1,
    width: "100%-3",
    height: 1,
    content: "{grey-fg}enter edit · s save · esc back{/grey-fg}",
    tags: true,
  });

  const refresh = () => {
    list.setItems(renderItems(settings));
    status.setContent(dirty ? "{yellow-fg}unsaved changes{/yellow-fg}" : "");
    screen.render();
  };

  const selectedIndex = (): number => {
    const raw = (list as unknown as { selected?: number }).selected;
    return typeof raw === "number" ? raw : 0;
  };

  const promptText = (title: string, initial: string, onSubmit: (v: string) => void) => {
    const modal = blessed.box({
      parent: screen,
      top: "center",
      left: "center",
      width: 60,
      height: 7,
      tags: true,
      border: { type: "line" },
      style: { border: { fg: "yellow" }, bg: "black" },
      label: ` ${title} `,
    });

    const input = blessed.textbox({
      parent: modal,
      top: 2,
      left: 1,
      width: "100%-3",
      height: 1,
      inputOnFocus: true,
      keys: true,
      mouse: false,
      style: { fg: "white", bg: "blue" },
    });

    blessed.text({
      parent: modal,
      bottom: 0,
      left: 1,
      width: "100%-3",
      height: 1,
      content: "{grey-fg}enter save · esc cancel{/grey-fg}",
      tags: true,
    });

    const finish = () => {
      modal.destroy();
      list.focus();
      screen.render();
    };

    input.on("submit", (value: string | undefined) => {
      const trimmed = (value ?? "").trim();
      finish();
      onSubmit(trimmed);
    });
    input.on("cancel", finish);

    input.setValue(initial);
    input.focus();
    screen.render();
  };

  const activate = () => {
    const row = ROWS[selectedIndex()];
    if (!row) return;
    const key = row.key;

    if (row.editable === "cycle" && key.kind === "provider") {
      const current = settings.providers[key.tier].provider;
      settings.providers[key.tier].provider = nextProvider(current);
      dirty = true;
      refresh();
      return;
    }

    if (key.kind === "model") {
      promptText(`${key.tier} model`, settings.providers[key.tier].model, (value) => {
        if (!value) return;
        settings.providers[key.tier].model = value;
        dirty = true;
        refresh();
      });
      return;
    }

    if (key.kind === "anthropicKey") {
      promptText("Anthropic API key (blank to clear)", "", (value) => {
        if (value) {
          settings.apiKeys.anthropic = value;
          settings.apiKeySource.anthropic = "stored";
        } else {
          settings.apiKeys.anthropic = undefined;
          settings.apiKeySource.anthropic = process.env.ANTHROPIC_API_KEY ? "env" : "none";
          if (settings.apiKeySource.anthropic === "env") {
            settings.apiKeys.anthropic = process.env.ANTHROPIC_API_KEY;
          }
        }
        dirty = true;
        refresh();
      });
      return;
    }

    if (key.kind === "ollamaUrl") {
      promptText("Ollama base URL", settings.ollama.baseUrl, (value) => {
        if (!value) return;
        settings.ollama.baseUrl = value;
        dirty = true;
        refresh();
      });
    }
  };

  const persist = () => {
    try {
      saveSettings(settings);
      dirty = false;
      status.setContent("{green-fg}saved{/green-fg}");
      screen.render();
    } catch (err) {
      status.setContent(`{red-fg}save failed: ${(err as Error).message}{/red-fg}`);
      screen.render();
    }
  };

  const close = () => {
    if (dirty) persist();
    handlers.onClose();
  };

  list.on("select", activate);
  list.key(["enter"], activate);
  list.key(["s"], persist);
  list.key(["escape"], close);
  list.focus();

  screen.render();

  return () => {
    list.unkey("enter", activate);
    list.unkey("s", persist);
    list.unkey("escape", close);
    panel.destroy();
    screen.render();
  };
}

function renderItems(s: Settings): string[] {
  return ROWS.map((row) => {
    const value = row.describe(s);
    const marker = row.editable === "cycle" ? "◂ ▸" : "   ";
    return `  ${row.label.padEnd(22)}${marker}  ${value}`;
  });
}
