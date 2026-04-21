import { unlinkSync } from "node:fs";
import { createServer } from "node:http";
import { createGateway, hasUsableProvider } from "../src/ai/gateway.js";
import { createOllamaProvider } from "../src/ai/providers/ollama.js";
import { loadSettings, saveSettings } from "../src/config/settings.js";
import { settingsPath } from "../src/persistence/paths.js";

// 1. Settings round-trip
const before = loadSettings();
const originalPath = settingsPath();
let hadOriginal = false;
try {
  // back up existing
  const fs = await import("node:fs");
  if (fs.existsSync(originalPath)) {
    fs.copyFileSync(originalPath, `${originalPath}.bak`);
    hadOriginal = true;
  }

  saveSettings({
    ...before,
    providers: {
      ...before.providers,
      light: { provider: "ollama", model: "llama3.1:8b" },
    },
    ollama: { baseUrl: "http://localhost:65500" },
  });

  const reloaded = loadSettings();
  console.log("light provider after save:", reloaded.providers.light.provider);
  console.log("light model after save:", reloaded.providers.light.model);
  console.log("ollama url after save:", reloaded.ollama.baseUrl);
  console.log("hasUsableProvider:", hasUsableProvider(reloaded));
} finally {
  const fs = await import("node:fs");
  if (hadOriginal) {
    fs.copyFileSync(`${originalPath}.bak`, originalPath);
    unlinkSync(`${originalPath}.bak`);
  } else if (fs.existsSync(originalPath)) {
    unlinkSync(originalPath);
  }
}

// 2. Ollama provider against a mock server
const server = createServer((req, res) => {
  if (req.url !== "/api/chat" || req.method !== "POST") {
    res.statusCode = 404;
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    res.setHeader("content-type", "application/x-ndjson");
    if (body.stream) {
      const parts = ["Hello ", "from ", "Ollama."];
      for (const p of parts) {
        res.write(
          `${JSON.stringify({ message: { role: "assistant", content: p }, done: false })}\n`,
        );
      }
      res.write(
        `${JSON.stringify({ message: { role: "assistant", content: "" }, done: true, prompt_eval_count: 7, eval_count: 3 })}\n`,
      );
      res.end();
    } else {
      res.end(
        JSON.stringify({
          message: { role: "assistant", content: "offline reply" },
          done: true,
          prompt_eval_count: 5,
          eval_count: 2,
        }),
      );
    }
  });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const addr = server.address();
if (!addr || typeof addr === "string") throw new Error("no server address");
const baseUrl = `http://127.0.0.1:${addr.port}`;

const provider = createOllamaProvider({ baseUrl, model: "test-model" });

const completeRes = await provider.complete({
  tier: "light",
  system: "be terse",
  messages: [{ role: "user", content: "hi" }],
  maxTokens: 32,
});
console.log("ollama complete text:", completeRes.text);
console.log("ollama complete usage:", completeRes.usage);

let streamed = "";
let doneUsage = { inputTokens: 0, outputTokens: 0 };
for await (const chunk of provider.stream({
  tier: "light",
  system: "be terse",
  messages: [{ role: "user", content: "stream please" }],
  maxTokens: 32,
})) {
  if (chunk.kind === "delta" && chunk.text) streamed += chunk.text;
  if (chunk.kind === "done" && chunk.usage) doneUsage = chunk.usage;
}
console.log("ollama streamed text:", streamed);
console.log("ollama streamed usage:", doneUsage);

// 3. Gateway dispatches to Ollama
const gw = createGateway({
  ...before,
  providers: {
    heavy: before.providers.heavy,
    medium: before.providers.medium,
    light: { provider: "ollama", model: "test-model" },
  },
  ollama: { baseUrl },
});
const gwRes = await gw.complete({
  tier: "light",
  system: "",
  messages: [{ role: "user", content: "x" }],
  maxTokens: 16,
});
console.log("gateway routed text:", gwRes.text);

server.close();
