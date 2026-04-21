import type { AIProvider, CompletionReq, CompletionRes, Message, StreamChunk } from "../types.js";

export interface OllamaOptions {
  baseUrl: string;
  model: string;
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

function buildBody(req: CompletionReq, model: string, stream: boolean): Record<string, unknown> {
  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const m of req.messages) messages.push({ role: m.role, content: m.content });

  const options: Record<string, unknown> = {};
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.maxTokens) options.num_predict = req.maxTokens;
  if (req.stop && req.stop.length > 0) options.stop = req.stop;

  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
    options,
  };
  if (req.jsonSchema) body.format = req.jsonSchema;
  return body;
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Some Ollama models wrap JSON in prose or code fences. Try to recover.
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        // fall through
      }
    }
    throw new Error("Ollama returned invalid JSON");
  }
}

export function createOllamaProvider(opts: OllamaOptions): AIProvider {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/api/chat`;

  return {
    id: "ollama",

    async complete(req: CompletionReq): Promise<CompletionRes> {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(req, opts.model, false)),
      });
      if (!res.ok) {
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as OllamaChatResponse;
      const text = data.message?.content ?? "";
      const usage = {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      };
      if (req.jsonSchema) {
        return { text, json: extractJson(text), usage };
      }
      return { text, usage };
    },

    async *stream(req: CompletionReq): AsyncIterable<StreamChunk> {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(req, opts.model, true)),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          while (true) {
            const newlineAt = buffer.indexOf("\n");
            if (newlineAt < 0) break;
            const line = buffer.slice(0, newlineAt).trim();
            buffer = buffer.slice(newlineAt + 1);
            if (!line) continue;
            const chunk = JSON.parse(line) as OllamaChatResponse;
            if (chunk.message?.content) {
              yield { kind: "delta", text: chunk.message.content };
            }
            if (chunk.done) {
              inputTokens = chunk.prompt_eval_count ?? inputTokens;
              outputTokens = chunk.eval_count ?? outputTokens;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      yield { kind: "done", usage: { inputTokens, outputTokens } };
    },
  };
}

// Exported for tests
export const __test = { buildBody, extractJson };
export type { Message };
