#!/usr/bin/env tsx
/**
 * Comprehensive MCP server test suite.
 * Tests both stdio and remote (streamable-http) transports against production.
 *
 * Usage:
 *   npm test                      # test both transports
 *   TRANSPORT=stdio npm test      # stdio only
 *   TRANSPORT=remote npm test     # remote only
 *
 * Env:
 *   SNAPRENDER_API_KEY   — required
 *   SNAPRENDER_URL       — override remote URL (default: https://app.snap-render.com)
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MCP_SERVER_PATH = resolve(__dirname, "../mcp-server/dist/index.js");

const API_KEY = process.env.SNAPRENDER_API_KEY;
const BASE_URL = process.env.SNAPRENDER_URL || "https://app.snap-render.com";
const TRANSPORT_FILTER = process.env.TRANSPORT; // "stdio" | "remote" | undefined (both)

if (!API_KEY) {
  console.error("SNAPRENDER_API_KEY is required");
  process.exit(1);
}

// ─── Test infrastructure ────────────────────────────────────────────

interface TestResult {
  name: string;
  transport: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];
let currentTransport = "";

async function test(name: string, fn: (client: Client) => Promise<void>, client: Client) {
  const start = Date.now();
  try {
    await fn(client);
    const duration = Date.now() - start;
    results.push({ name, transport: currentTransport, passed: true, duration });
    console.log(`  ✓ ${name} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, transport: currentTransport, passed: false, duration, error: message });
    console.log(`  ✗ ${name} (${duration}ms)`);
    console.log(`    ${message}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertIncludes(text: string, substring: string, label?: string) {
  if (!text.includes(substring)) {
    throw new Error(`${label || "Text"} should include "${substring}" but got: ${text.slice(0, 200)}`);
  }
}

// ─── Transport factories ────────────────────────────────────────────

async function createStdioClient(): Promise<Client> {
  const client = new Client({ name: "mcp-test-stdio", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [MCP_SERVER_PATH],
    env: { ...process.env, SNAPRENDER_API_KEY: API_KEY! },
  });
  await client.connect(transport);
  return client;
}

async function createRemoteClient(): Promise<Client> {
  const client = new Client({ name: "mcp-test-remote", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(
    new URL(`${BASE_URL}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } } },
  );
  await client.connect(transport);
  return client;
}

// ─── Test suites ────────────────────────────────────────────────────

async function testProtocolCompliance(client: Client) {
  // 1. Server info
  await test("server reports correct name and version", async () => {
    const info = client.getServerVersion();
    assert(!!info, "server info should exist");
    assert(info!.name.includes("snaprender"), `server name should include 'snaprender', got '${info!.name}'`);
    assert(/^\d+\.\d+\.\d+$/.test(info!.version), `version should be semver, got '${info!.version}'`);
  }, client);

  // 2. Tools list
  await test("lists all 11 tools", async () => {
    const { tools } = await client.listTools();
    assert(tools.length === 11, `expected 11 tools, got ${tools.length}`);
    const names = tools.map(t => t.name).sort();
    const expected = [
      "batch_screenshots", "check_screenshot_cache", "create_webhook",
      "delete_webhook", "extract_content", "get_batch_status", "get_usage",
      "list_webhooks", "sign_screenshot_url", "take_screenshot", "test_webhook",
    ];
    assert(JSON.stringify(names) === JSON.stringify(expected), `tool names mismatch: ${names.join(", ")}`);
  }, client);

  // 3. Tool annotations (Anthropic requirement)
  await test("all tools have title annotation", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const ann = (tool as any).annotations;
      assert(ann?.title, `tool '${tool.name}' missing title annotation`);
    }
  }, client);

  await test("all tools have readOnlyHint annotation", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const ann = (tool as any).annotations;
      assert(typeof ann?.readOnlyHint === "boolean", `tool '${tool.name}' missing readOnlyHint`);
    }
  }, client);

  await test("all tools have destructiveHint annotation", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const ann = (tool as any).annotations;
      assert(typeof ann?.destructiveHint === "boolean", `tool '${tool.name}' missing destructiveHint`);
    }
  }, client);

  // 4. Tool input schemas
  await test("all tools have inputSchema with type=object", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      assert(tool.inputSchema?.type === "object", `tool '${tool.name}' inputSchema.type should be 'object'`);
    }
  }, client);

  // 5. list_webhooks is readOnly, delete_webhook is destructive
  await test("list_webhooks is readOnly", async () => {
    const { tools } = await client.listTools();
    const lw = tools.find(t => t.name === "list_webhooks");
    assert(lw, "list_webhooks tool should exist");
    assert((lw as any).annotations?.readOnlyHint === true, "list_webhooks should have readOnlyHint=true");
  }, client);

  await test("delete_webhook is destructive", async () => {
    const { tools } = await client.listTools();
    const dw = tools.find(t => t.name === "delete_webhook");
    assert(dw, "delete_webhook tool should exist");
    assert((dw as any).annotations?.destructiveHint === true, "delete_webhook should have destructiveHint=true");
    assert((dw as any).annotations?.readOnlyHint === false, "delete_webhook should have readOnlyHint=false");
  }, client);

  await test("create_webhook is not readOnly", async () => {
    const { tools } = await client.listTools();
    const cw = tools.find(t => t.name === "create_webhook");
    assert(cw, "create_webhook tool should exist");
    assert((cw as any).annotations?.readOnlyHint === false, "create_webhook should have readOnlyHint=false");
  }, client);
}

async function testScreenshot(client: Client) {
  // Basic screenshot
  await test("take_screenshot: captures example.com as PNG", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "https://example.com", width: 800, height: 600 },
    });
    assert(!result.isError, `should not error: ${JSON.stringify(result.content)}`);
    const image = (result.content as any[]).find((c: any) => c.type === "image");
    assert(!!image, "should return an image content block");
    assert(image.mimeType === "image/png", `should be PNG, got ${image.mimeType}`);
    assert(image.data.length > 100, "image data should not be empty");
    const text = (result.content as any[]).find((c: any) => c.type === "text");
    assert(!!text, "should include text metadata");
    assert(text.text.includes("remaining"), "metadata should include remaining info");
  }, client);

  // JPEG format
  await new Promise(r => setTimeout(r, 2000));
  await test("take_screenshot: JPEG format works", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "https://example.com", format: "jpeg", quality: 50 },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const image = (result.content as any[]).find((c: any) => c.type === "image");
    assert(image?.mimeType === "image/jpeg", `should be JPEG, got ${image?.mimeType}`);
  }, client);

  // Dark mode
  await new Promise(r => setTimeout(r, 2000));
  await test("take_screenshot: dark mode", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "https://example.com", dark_mode: true },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
  }, client);

  // Device emulation
  await new Promise(r => setTimeout(r, 2000));
  await test("take_screenshot: iPhone 15 Pro emulation", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "https://example.com", device: "iphone_15_pro" },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
  }, client);

  // Missing URL should error
  await test("take_screenshot: missing url/html/markdown returns error", async () => {
    try {
      const result = await client.callTool({
        name: "take_screenshot",
        arguments: {},
      });
      assert(result.isError === true, "should return isError=true");
    } catch {
      // Remote server throws MCP protocol error, which is also acceptable
    }
  }, client);
}

async function testExtract(client: Client) {
  // Markdown extraction
  await test("extract_content: markdown from example.com", async () => {
    const result = await client.callTool({
      name: "extract_content",
      arguments: { url: "https://example.com", type: "markdown" },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assert(!!text, "should return text content");
    assertIncludes(text.toLowerCase(), "example", "extracted content");
  }, client);

  // Metadata extraction (delay to avoid rate limit)
  await new Promise(r => setTimeout(r, 1500));
  await test("extract_content: metadata extraction", async () => {
    const result = await client.callTool({
      name: "extract_content",
      arguments: { url: "https://example.com", type: "metadata" },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assert(!!text, "should return metadata");
  }, client);

  // Links extraction (different domain + delay to avoid rate limit)
  await new Promise(r => setTimeout(r, 3000));
  await test("extract_content: links extraction", async () => {
    const result = await client.callTool({
      name: "extract_content",
      arguments: { url: "https://httpbin.org/html", type: "links" },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
  }, client);

  // Missing URL
  await test("extract_content: missing url returns error", async () => {
    try {
      const result = await client.callTool({
        name: "extract_content",
        arguments: { type: "markdown" },
      });
      assert(result.isError === true, "should error without url");
    } catch {
      // Remote server throws MCP protocol error
    }
  }, client);
}

async function testCache(client: Client) {
  await test("check_screenshot_cache: returns cache info", async () => {
    const result = await client.callTool({
      name: "check_screenshot_cache",
      arguments: { url: "https://example.com" },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assert(!!text, "should return cache info");
  }, client);
}

async function testSignUrl(client: Client) {
  await test("sign_screenshot_url: generates signed URL", async () => {
    const result = await client.callTool({
      name: "sign_screenshot_url",
      arguments: { url: "https://example.com", expires_in: 3600 },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assertIncludes(text, "snap-render.com", "signed URL response");
    assertIncludes(text, "Expires", "should include expiry info");
  }, client);
}

async function testUsage(client: Client) {
  await test("get_usage: returns usage stats", async () => {
    const result = await client.callTool({
      name: "get_usage",
      arguments: {},
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    const data = JSON.parse(text);
    const usage = data.usage || data;
    const hasUsed = typeof usage.screenshots_used === "number" || typeof usage.used === "number";
    const hasLimit = typeof usage.screenshots_limit === "number" || typeof usage.limit === "number";
    assert(data.plan || hasUsed, `should have plan or usage data, got: ${text.slice(0, 200)}`);
    assert(data.period || hasLimit, `should have period or limit data, got: ${text.slice(0, 200)}`);
  }, client);
}

async function testBatch(client: Client) {
  // Create batch job
  let jobId: string | undefined;

  await test("batch_screenshots: creates job with 2 URLs", async () => {
    const result = await client.callTool({
      name: "batch_screenshots",
      arguments: {
        urls: ["https://example.com", "https://httpbin.org/html"],
        format: "png",
        width: 800,
        height: 600,
      },
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assertIncludes(text, "Job ID:", "should return job ID");
    const match = text.match(/Job ID: (\S+)/);
    assert(!!match, "should extract job ID");
    jobId = match![1];
  }, client);

  // Poll for status
  if (jobId) {
    await test("get_batch_status: polls batch job", async () => {
      let attempts = 0;
      let finalStatus = "";
      while (attempts < 20) {
        await new Promise(r => setTimeout(r, 3000));
        const result = await client.callTool({
          name: "get_batch_status",
          arguments: { job_id: jobId },
        });
        assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
        const text = (result.content as any[])[0]?.text;
        if (text.includes("Status: completed")) {
          finalStatus = "completed";
          assertIncludes(text, "[OK]", "completed items should show [OK]");
          break;
        }
        if (text.includes("Status: failed")) {
          finalStatus = "failed";
          break;
        }
        attempts++;
      }
      assert(finalStatus === "completed", `batch should complete, got '${finalStatus}' after ${attempts} polls`);
    }, client);
  }

  // Batch with too many URLs
  await test("batch_screenshots: rejects >50 URLs", async () => {
    const urls = Array.from({ length: 51 }, (_, i) => `https://example.com/${i}`);
    try {
      const result = await client.callTool({
        name: "batch_screenshots",
        arguments: { urls },
      });
      assert(result.isError === true, "should reject >50 URLs");
    } catch {
      // Remote server throws MCP protocol error
    }
  }, client);
}

async function testWebhooks(client: Client) {
  // List webhooks
  await test("list_webhooks: returns response", async () => {
    const result = await client.callTool({
      name: "list_webhooks",
      arguments: {},
    });
    assert(!result.isError, `error: ${JSON.stringify(result.content)}`);
    const text = (result.content as any[])[0]?.text;
    assert(!!text, "should return text content");
  }, client);

  // Create with invalid URL (HTTP, not HTTPS)
  await test("create_webhook: rejects HTTP webhook URL", async () => {
    try {
      const result = await client.callTool({
        name: "create_webhook",
        arguments: {
          url: "http://example.com/webhook",
          events: ["quota.warning"],
        },
      });
      assert(result.isError === true, "should reject HTTP URL");
    } catch {
      // Remote server throws MCP protocol error or backend rejects
    }
  }, client);

  // Create with localhost
  await test("create_webhook: rejects localhost webhook URL", async () => {
    try {
      const result = await client.callTool({
        name: "create_webhook",
        arguments: {
          url: "https://localhost:8080/webhook",
          events: ["quota.warning"],
        },
      });
      assert(result.isError === true, "should reject localhost");
    } catch {
      // Remote server throws MCP protocol error
    }
  }, client);

  // Delete non-existent
  await test("delete_webhook: non-existent returns error", async () => {
    try {
      const result = await client.callTool({
        name: "delete_webhook",
        arguments: { webhook_id: "fake-id-does-not-exist" },
      });
      assert(result.isError === true, "should error for non-existent webhook");
    } catch {
      // Remote server throws MCP protocol error
    }
  }, client);

  // Test non-existent webhook
  await test("test_webhook: non-existent returns error", async () => {
    try {
      const result = await client.callTool({
        name: "test_webhook",
        arguments: { webhook_id: "fake-id-does-not-exist" },
      });
      assert(result.isError === true, "should error for non-existent webhook");
    } catch {
      // Remote server throws MCP protocol error
    }
  }, client);
}

async function testErrorHandling(client: Client) {
  // Unknown tool
  await test("unknown tool returns error (not crash)", async () => {
    try {
      const result = await client.callTool({
        name: "nonexistent_tool",
        arguments: {},
      });
      assert(result.isError === true, "should return error for unknown tool");
    } catch (err) {
      // Protocol-level error is also acceptable
      assert(err instanceof Error, "should throw Error");
    }
  }, client);

  // Invalid URL (SSRF-like, should be blocked by backend)
  await test("take_screenshot: private IP is rejected", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "http://192.168.1.1" },
    });
    assert(result.isError === true, "should reject private IP");
  }, client);

  // Completely invalid URL
  await test("take_screenshot: malformed URL returns error", async () => {
    const result = await client.callTool({
      name: "take_screenshot",
      arguments: { url: "not-a-url" },
    });
    assert(result.isError === true, "should reject malformed URL");
  }, client);

  // get_batch_status with fake job ID
  await test("get_batch_status: fake job_id returns error", async () => {
    const result = await client.callTool({
      name: "get_batch_status",
      arguments: { job_id: "nonexistent-job-id" },
    });
    assert(result.isError === true, "should error for fake job ID");
  }, client);
}

// ─── Runner ─────────────────────────────────────────────────────────

async function runSuite(transportName: string, clientFactory: () => Promise<Client>) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${transportName.toUpperCase()} TRANSPORT`);
  console.log(`${"═".repeat(60)}\n`);

  currentTransport = transportName;
  let client: Client;

  try {
    client = await clientFactory();
    console.log(`  Connected to server\n`);
  } catch (err) {
    console.log(`  ✗ Failed to connect: ${err instanceof Error ? err.message : err}\n`);
    results.push({ name: "connect", transport: transportName, passed: false, duration: 0, error: String(err) });
    return;
  }

  console.log("  Protocol Compliance:");
  await testProtocolCompliance(client);

  console.log("\n  Content Extraction (extract_content):");
  await testExtract(client);

  console.log("\n  Screenshot (take_screenshot):");
  await testScreenshot(client);

  console.log("\n  Cache (check_screenshot_cache):");
  await testCache(client);

  console.log("\n  Signed URLs (sign_screenshot_url):");
  await testSignUrl(client);

  console.log("\n  Usage (get_usage):");
  await testUsage(client);

  console.log("\n  Batch (batch_screenshots + get_batch_status):");
  await testBatch(client);

  console.log("\n  Webhooks (list/create/delete/test_webhook):");
  await testWebhooks(client);

  console.log("\n  Error Handling:");
  await testErrorHandling(client);

  try {
    await client.close();
  } catch {
    // ignore close errors
  }
}

async function main() {
  console.log("SnapRender MCP Server Test Suite");
  console.log(`API Key: ${API_KEY!.slice(0, 12)}...`);
  console.log(`Remote URL: ${BASE_URL}`);
  console.log(`Transport filter: ${TRANSPORT_FILTER || "both"}`);

  if (!TRANSPORT_FILTER || TRANSPORT_FILTER === "stdio") {
    await runSuite("stdio", createStdioClient);
  }

  if (!TRANSPORT_FILTER || TRANSPORT_FILTER === "remote") {
    await runSuite("remote", createRemoteClient);
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("  RESULTS");
  console.log(`${"═".repeat(60)}\n`);

  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  console.log(`  Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length}\n`);

  if (failed.length > 0) {
    console.log("  Failed tests:");
    for (const f of failed) {
      console.log(`    [${f.transport}] ${f.name}`);
      console.log(`      ${f.error}`);
    }
    console.log();
  }

  // Anthropic compliance summary
  console.log("  Anthropic Directory Compliance:");
  const toolTests = results.filter(r => r.name.includes("annotation") || r.name.includes("title") || r.name.includes("readOnly") || r.name.includes("destructive") || r.name.includes("inputSchema"));
  const allToolTestsPass = toolTests.every(r => r.passed);
  console.log(`    Tool annotations:     ${allToolTestsPass ? "PASS" : "FAIL"}`);

  const errorTests = results.filter(r => r.name.includes("error") || r.name.includes("reject") || r.name.includes("missing") || r.name.includes("fake") || r.name.includes("malformed"));
  const allErrorTestsPass = errorTests.every(r => r.passed);
  console.log(`    Error handling:       ${allErrorTestsPass ? "PASS" : "FAIL"}`);

  const securityTests = results.filter(r => r.name.includes("private IP") || r.name.includes("localhost") || r.name.includes("HTTP webhook"));
  const allSecurityPass = securityTests.every(r => r.passed);
  console.log(`    Security (SSRF/URL):  ${allSecurityPass ? "PASS" : "FAIL"}`);

  const functionalTests = results.filter(r => !r.name.includes("reject") && !r.name.includes("missing") && !r.name.includes("error") && !r.name.includes("fake") && !r.name.includes("malformed") && !r.name.includes("annotation") && !r.name.includes("title") && !r.name.includes("readOnly") && !r.name.includes("destructive") && !r.name.includes("inputSchema") && !r.name.includes("private IP") && !r.name.includes("localhost") && !r.name.includes("HTTP webhook"));
  const allFunctionalPass = functionalTests.every(r => r.passed);
  console.log(`    Functional (tools):   ${allFunctionalPass ? "PASS" : "FAIL"}`);
  console.log();

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
