// Run: npm run build && npx tsx examples/basic.ts
// Needs SNAPRENDER_API_KEY plus one model key: ANTHROPIC_API_KEY, OPENAI_API_KEY,
// or AI_GATEWAY_API_KEY (then any "provider/model" id works).
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { generateText, isStepCount, type LanguageModel } from "ai";
import { snaprenderTools } from "snaprender-ai-sdk";

const model: LanguageModel = process.env.ANTHROPIC_API_KEY
  ? anthropic("claude-sonnet-5-5")
  : process.env.OPENAI_API_KEY
    ? openai("gpt-5-mini")
    : "openai/gpt-5-mini";

const url = process.argv[2] ?? "https://snap-render.com";

const { text, steps } = await generateText({
  model,
  tools: snaprenderTools(),
  stopWhen: isStepCount(4),
  prompt:
    `Take a screenshot of ${url} on an iPhone (device iphone_14) and read the page as markdown. ` +
    "Then tell me in three short bullet points what the page offers and one thing about the mobile layout you can see in the screenshot.",
});

for (const step of steps) {
  for (const call of step.toolCalls) console.error(`tool call: ${call.toolName} ${JSON.stringify(call.input)}`);
}
console.log(text);
