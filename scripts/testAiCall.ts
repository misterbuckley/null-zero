import { createGateway } from "../src/ai/gateway.js";
import { jsonComplete } from "../src/ai/json.js";
import { RegionFlavorSchema } from "../src/ai/schemas.js";
import { loadSettings } from "../src/config/settings.js";

async function main() {
  const settings = loadSettings();
  if (!settings.apiKeys.anthropic) {
    console.error("Set ANTHROPIC_API_KEY and re-run this script.");
    process.exit(1);
  }

  const gateway = createGateway(settings);

  const flavor = await jsonComplete(
    gateway,
    {
      tier: "medium",
      system:
        "You are a dark-fantasy worldbuilder. Produce terse, atmospheric region descriptions. Avoid cliché.",
      messages: [
        {
          role: "user",
          content:
            "A player has just entered a ruined stone chamber beneath a dead cathedral. Describe it.",
        },
      ],
      maxTokens: 600,
    },
    RegionFlavorSchema,
  );

  console.log(JSON.stringify(flavor, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
