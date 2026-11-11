// Exact codeExample from registry/vercel-tools-registry-entry.ts (kept here so `npm run typecheck` compiles it).
// Runs through the AI Gateway: needs AI_GATEWAY_API_KEY and SNAPRENDER_API_KEY.
import { generateText, isStepCount } from 'ai';
import { snaprenderTools } from 'snaprender-ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5.5',
  prompt:
    'Take a screenshot of https://vercel.com on an iPhone and tell me what the first screen shows.',
  tools: snaprenderTools(),
  stopWhen: isStepCount(3),
});

console.log(text);
