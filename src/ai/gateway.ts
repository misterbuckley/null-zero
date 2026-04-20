import type { Settings, TierConfig } from "../config/settings.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import type { AIProvider, CompletionReq, CompletionRes, StreamChunk, Tier } from "./types.js";

export interface Gateway {
  complete(req: CompletionReq): Promise<CompletionRes>;
  stream(req: CompletionReq): AsyncIterable<StreamChunk>;
}

export function createGateway(settings: Settings): Gateway {
  const providers: Record<Tier, AIProvider> = {
    heavy: makeProvider(settings.providers.heavy, settings),
    medium: makeProvider(settings.providers.medium, settings),
    light: makeProvider(settings.providers.light, settings),
  };

  return {
    complete: (req) => providers[req.tier].complete(req),
    stream: (req) => providers[req.tier].stream(req),
  };
}

function makeProvider(cfg: TierConfig, settings: Settings): AIProvider {
  switch (cfg.provider) {
    case "anthropic": {
      const key = settings.apiKeys.anthropic;
      if (!key) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Either set the env var or change providers in settings.",
        );
      }
      return createAnthropicProvider({ apiKey: key, model: cfg.model });
    }
    case "openai":
    case "ollama":
    case "openai-compat":
      throw new Error(`Provider "${cfg.provider}" is not implemented yet.`);
  }
}
