export type Tier = "heavy" | "medium" | "light";

export type ProviderId = "anthropic" | "openai" | "ollama" | "openai-compat";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionReq {
  tier: Tier;
  system: string;
  messages: Message[];
  maxTokens: number;
  temperature?: number;
  jsonSchema?: object;
  stop?: string[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionRes {
  text: string;
  json?: unknown;
  usage: Usage;
}

export interface StreamChunk {
  kind: "delta" | "done";
  text?: string;
  usage?: Usage;
}

export interface AIProvider {
  id: ProviderId;
  complete(req: CompletionReq): Promise<CompletionRes>;
  stream(req: CompletionReq): AsyncIterable<StreamChunk>;
}
