// Starts the built server over stdio and checks that it lists every tool. No API calls are made.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const EXPECTED = [
  'take_screenshot', 'check_screenshot_cache', 'get_usage', 'sign_screenshot_url', 'extract_content',
  'batch_screenshots', 'get_batch_status', 'list_webhooks', 'create_webhook', 'delete_webhook', 'test_webhook',
];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, SNAPRENDER_API_KEY: 'sk_live_ci_placeholder' },
});
const client = new Client({ name: 'ci-smoke', version: '1.0.0' });
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
await client.close();

const missing = EXPECTED.filter((n) => !names.includes(n));
if (missing.length || names.length !== EXPECTED.length) {
  console.error(`Unexpected tools. Got: ${names.join(', ')}. Missing: ${missing.join(', ') || 'none'}`);
  process.exit(1);
}
console.log(`OK: ${names.length} tools`);
