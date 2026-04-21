import type { Settings, TierConfig } from "../config/settings.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOllamaProvider } from "./providers/ollama.js";
import type { AIProvider, CompletionReq, CompletionRes, StreamChunk, Tier } from "./types.js";

export interface Gateway {
  complete(req: CompletionReq): Promise<CompletionRes>;
  stream(req: CompletionReq): AsyncIterable<StreamChunk>;
}

export function createGateway(settings: Settings): Gateway {
  const cache = new Map<string, AIProvider>();

  const getProvider = (tier: Tier): AIProvider => {
    const cfg = settings.providers[tier];
    const key = `${cfg.provider}:${cfg.model}`;
    let provider = cache.get(key);
    if (!provider) {
      provider = makeProvider(cfg, settings);
      cache.set(key, provider);
    }
    return provider;
  };

  return {
    complete: (req) => getProvider(req.tier).complete(req),
    stream: (req) => getProvider(req.tier).stream(req),
  };
}

export function hasUsableProvider(settings: Settings): boolean {
  return (Object.keys(settings.providers) as Tier[]).some((tier) =>
    canBuildProvider(settings.providers[tier], settings),
  );
}

export function canBuildProvider(cfg: TierConfig, settings: Settings): boolean {
  switch (cfg.provider) {
    case "anthropic":
      return Boolean(settings.apiKeys.anthropic);
    case "ollama":
      return Boolean(settings.ollama.baseUrl);
    case "openai":
    case "openai-compat":
      return false;
  }
}

function makeProvider(cfg: TierConfig, settings: Settings): AIProvider {
  switch (cfg.provider) {
    case "anthropic": {
      const key = settings.apiKeys.anthropic;
      if (!key) {
        throw new Error(
          "Anthropic API key is not set. Add it in Settings or set ANTHROPIC_API_KEY.",
        );
      }
      return createAnthropicProvider({ apiKey: key, model: cfg.model });
    }
    case "ollama": {
      return createOllamaProvider({
        baseUrl: settings.ollama.baseUrl,
        model: cfg.model,
      });
    }
    case "openai":
    case "openai-compat":
      throw new Error(`Provider "${cfg.provider}" is not implemented yet.`);
  }
}
