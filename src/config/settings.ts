import type { ProviderId, Tier } from "../ai/types.js";

export interface TierConfig {
  provider: ProviderId;
  model: string;
}

export interface Settings {
  providers: Record<Tier, TierConfig>;
  apiKeys: {
    anthropic?: string;
    openai?: string;
  };
  ollama: {
    baseUrl: string;
  };
}

const DEFAULT_SETTINGS: Settings = {
  providers: {
    heavy: { provider: "anthropic", model: "claude-opus-4-7" },
    medium: { provider: "anthropic", model: "claude-sonnet-4-6" },
    light: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  },
  apiKeys: {},
  ollama: { baseUrl: "http://localhost:11434" },
};

export function loadSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_SETTINGS.ollama.baseUrl,
    },
  };
}
