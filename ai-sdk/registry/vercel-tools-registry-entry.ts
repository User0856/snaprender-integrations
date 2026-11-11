// Entry to append to the `tools` array in vercel/ai content/tools-registry/registry.ts
// (see registry/PR.md). The codeExample is identical to examples/registry-snippet.ts.
  {
    slug: 'snaprender',
    name: 'SnapRender',
    description:
      'Screenshot and page-reading tools for the AI SDK. takeScreenshot captures any public URL or raw HTML in a real Chrome browser (desktop, phone or tablet, viewport or full page) and returns the image so the model can look at it. extractContent returns the rendered page as markdown, article text, links or metadata. Ads and cookie banners are removed. Free plan: 200 captures a month.',
    packageName: 'snaprender-ai-sdk',
    tags: ['screenshot', 'browser', 'vision', 'web', 'extraction'],
    apiKeyEnvName: 'SNAPRENDER_API_KEY',
    installCommand: {
      pnpm: 'pnpm add snaprender-ai-sdk',
      npm: 'npm install snaprender-ai-sdk',
      yarn: 'yarn add snaprender-ai-sdk',
      bun: 'bun add snaprender-ai-sdk',
    },
    codeExample: `import { generateText, isStepCount } from 'ai';
import { snaprenderTools } from 'snaprender-ai-sdk';

const { text } = await generateText({
  model: 'anthropic/claude-sonnet-5.5',
  prompt:
    'Take a screenshot of https://vercel.com on an iPhone and tell me what the first screen shows.',
  tools: snaprenderTools(),
  stopWhen: isStepCount(3),
});

console.log(text);`,
    docsUrl: 'https://snap-render.com/integrations/ai-sdk',
    apiKeyUrl: 'https://app.snap-render.com/auth/signup',
    websiteUrl: 'https://snap-render.com',
    npmUrl: 'https://www.npmjs.com/package/snaprender-ai-sdk',
  },
