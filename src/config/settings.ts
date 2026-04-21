import { readFileSync, writeFileSync } from "node:fs";
import type { ProviderId, Tier } from "../ai/types.js";
import { settingsPath } from "../persistence/paths.js";

export interface TierConfig {
  provider: ProviderId;
  model: string;
}

export type KeySource = "env" | "stored" | "none";

export interface Settings {
  providers: Record<Tier, TierConfig>;
  apiKeys: {
    anthropic?: string;
    openai?: string;
  };
  apiKeySource: {
    anthropic: KeySource;
    openai: KeySource;
  };
  ollama: {
    baseUrl: string;
  };
}

interface StoredSettings {
  providers?: Partial<Record<Tier, TierConfig>>;
  apiKeys?: {
    anthropic?: string;
    openai?: string;
  };
  ollama?: {
    baseUrl?: string;
  };
}

const DEFAULT_SETTINGS: Settings = {
  providers: {
    heavy: { provider: "anthropic", model: "claude-opus-4-7" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6" },
    light: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  },
  apiKeys: {},
  apiKeySource: { anthropic: "none", openai: "none" },
  ollama: { baseUrl: "http://localhost:11434" },
};

function readStored(): StoredSettings {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as StoredSettings;
  } catch {
    // missing or malformed — treat as empty
  }
  return {};
}

export function loadSettings(): Settings {
  const stored = readStored();

  const providers: Record<Tier, TierConfig> = {
    heavy: { ...DEFAULT_SETTINGS.providers.heavy, ...stored.providers?.heavy },
    medium: { ...DEFAULT_SETTINGS.providers.medium, ...stored.providers?.medium },
    light: { ...DEFAULT_SETTINGS.providers.light, ...stored.providers?.light },
  };

  const apiKeys: Settings["apiKeys"] = {};
  const apiKeySource: Settings["apiKeySource"] = {
    anthropic: "none",
    openai: "none",
  };

  if (stored.apiKeys?.anthropic) {
    apiKeys.anthropic = stored.apiKeys.anthropic;
    apiKeySource.anthropic = "stored";
  } else if (process.env.ANTHROPIC_API_KEY) {
    apiKeys.anthropic = process.env.ANTHROPIC_API_KEY;
    apiKeySource.anthropic = "env";
  }

  if (stored.apiKeys?.openai) {
    apiKeys.openai = stored.apiKeys.openai;
    apiKeySource.openai = "stored";
  } else if (process.env.OPENAI_API_KEY) {
    apiKeys.openai = process.env.OPENAI_API_KEY;
    apiKeySource.openai = "env";
  }

  const ollamaBaseUrl =
    stored.ollama?.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_SETTINGS.ollama.baseUrl;

  return {
    providers,
    apiKeys,
    apiKeySource,
    ollama: { baseUrl: ollamaBaseUrl },
  };
}

export function saveSettings(settings: Settings): void {
  const apiKeys: StoredSettings["apiKeys"] = {};
  if (settings.apiKeySource.anthropic === "stored" && settings.apiKeys.anthropic) {
    apiKeys.anthropic = settings.apiKeys.anthropic;
  }
  if (settings.apiKeySource.openai === "stored" && settings.apiKeys.openai) {
    apiKeys.openai = settings.apiKeys.openai;
  }
  const toStore: StoredSettings = {
    providers: settings.providers,
    ollama: { baseUrl: settings.ollama.baseUrl },
  };
  if (Object.keys(apiKeys).length > 0) toStore.apiKeys = apiKeys;
  writeFileSync(settingsPath(), `${JSON.stringify(toStore, null, 2)}\n`, "utf8");
}
