import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompletionReq, CompletionRes, StreamChunk } from "../types.js";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
}

export function createAnthropicProvider(opts: AnthropicOptions): AIProvider {
  const client = new Anthropic({ apiKey: opts.apiKey });

  return {
    id: "anthropic",

    async complete(req: CompletionReq): Promise<CompletionRes> {
      const common = {
        model: opts.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.stop ? { stop_sequences: req.stop } : {}),
      };

      if (req.jsonSchema) {
        const response = await client.messages.create({
          ...common,
          tools: [
            {
              name: "output",
              description: "Return the requested structured output.",
              input_schema: req.jsonSchema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: { type: "tool", name: "output" },
        });

        const toolUse = response.content.find((b) => b.type === "tool_use");
        if (!toolUse || toolUse.type !== "tool_use") {
          throw new Error("Anthropic response missing tool_use block");
        }
        return {
          text: JSON.stringify(toolUse.input),
          json: toolUse.input,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        };
      }

      const response = await client.messages.create(common);
      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },

    async *stream(req: CompletionReq): AsyncIterable<StreamChunk> {
      const stream = client.messages.stream({
        model: opts.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.stop ? { stop_sequences: req.stop } : {}),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { kind: "delta", text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();
      yield {
        kind: "done",
        usage: {
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        },
      };
    },
  };
}
