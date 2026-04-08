#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.SNAPRENDER_API_KEY;
const BASE_URL =
  process.env.SNAPRENDER_URL || "https://app.snap-render.com";

if (!API_KEY) {
  console.error(
    "Error: SNAPRENDER_API_KEY environment variable is required.\n" +
      "Get a free API key at https://app.snap-render.com/auth/signup"
  );
  process.exit(1);
}

const server = new Server(
  { name: "snaprender-mcp", version: "1.4.0" },
  { capabilities: { tools: {} } }
);

// --- Tool definitions ---

const TOOLS = [
  {
    name: "take_screenshot",
    description:
      "Capture a screenshot of a website URL, raw HTML, or Markdown content. Provide exactly one of: url, html, or markdown. " +
      "Returns the image as a PNG, JPEG, WebP, or PDF. " +
      "Supports device emulation (iPhone, Pixel, iPad), dark mode, ad blocking, " +
      "cookie banner removal, full-page capture, and custom viewports.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to capture (must start with http:// or https://). Mutually exclusive with html and markdown.",
        },
        html: {
          type: "string",
          description: "Raw HTML content to render and capture (max 2MB). Mutually exclusive with url and markdown.",
        },
        markdown: {
          type: "string",
          description: "Markdown content to render with a clean styled template and capture (max 500KB). Mutually exclusive with url and html.",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp", "pdf"],
          description: "Output format (default: png)",
        },
        width: {
          type: "integer",
          minimum: 320,
          maximum: 3840,
          description: "Viewport width in pixels (default: 1280)",
        },
        height: {
          type: "integer",
          minimum: 200,
          maximum: 10000,
          description: "Viewport height in pixels (default: 800)",
        },
        full_page: {
          type: "boolean",
          description: "Capture entire scrollable page (default: false)",
        },
        quality: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Image quality for JPEG/WebP, 1-100 (default: 90)",
        },
        delay: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          description: "Milliseconds to wait after page load (default: 0)",
        },
        dark_mode: {
          type: "boolean",
          description: "Enable dark mode CSS emulation (default: false)",
        },
        block_ads: {
          type: "boolean",
          description: "Block advertisements and trackers (default: true)",
        },
        block_cookie_banners: {
          type: "boolean",
          description: "Remove cookie consent banners (default: true)",
        },
        device: {
          type: "string",
          enum: [
            "iphone_14",
            "iphone_15_pro",
            "pixel_7",
            "ipad_pro",
            "macbook_pro",
          ],
          description: "Device preset for mobile/tablet emulation",
        },
        hide_selectors: {
          type: "string",
          description: "Comma-separated CSS selectors to hide before capture",
        },
        click_selector: {
          type: "string",
          description: "CSS selector to click before capture",
        },
        user_agent: {
          type: "string",
          description: "Custom user agent string to use for the request",
        },
        cache: {
          type: "boolean",
          description:
            "Use cached result if available. Set to false to force a fresh capture (default: true)",
        },
        cache_ttl: {
          type: "integer",
          minimum: 0,
          maximum: 2592000,
          description:
            "Cache TTL in seconds, 0-2592000. Clamped to your plan max (default: 86400)",
        },
      },
      required: [],
    },
  },
  {
    name: "check_screenshot_cache",
    description:
      "Check if a screenshot is already cached without capturing a new one. " +
      "Does not count against your quota. Pass the same parameters you would use for take_screenshot " +
      "so the cache key matches correctly.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to check",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp", "pdf"],
          description: "Output format (default: png)",
        },
        width: { type: "integer", description: "Viewport width (default: 1280)" },
        height: { type: "integer", description: "Viewport height (default: 800)" },
        full_page: { type: "boolean", description: "Full page capture (default: false)" },
        dark_mode: { type: "boolean", description: "Dark mode (default: false)" },
        block_ads: { type: "boolean", description: "Block ads (default: true)" },
        device: { type: "string", description: "Device preset" },
        quality: { type: "integer", description: "Image quality (default: 90)" },
        hide_selectors: { type: "string", description: "CSS selectors to hide" },
        click_selector: { type: "string", description: "CSS selector to click" },
      },
      required: ["url"],
    },
  },
  {
    name: "sign_screenshot_url",
    description:
      "Generate a signed URL for a screenshot that can be used without an API key. " +
      "Useful for embedding screenshots in emails, documents, or sharing with third parties. " +
      "Signing is free, rendering the URL consumes one credit. URLs expire after the specified duration.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to capture (must start with http:// or https://)",
        },
        expires_in: {
          type: "integer",
          minimum: 60,
          maximum: 2592000,
          description: "URL validity in seconds, 60-2592000 (default: 86400 = 1 day)",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp", "pdf"],
          description: "Output format (default: png)",
        },
        width: {
          type: "integer",
          minimum: 320,
          maximum: 3840,
          description: "Viewport width in pixels (default: 1280)",
        },
        height: {
          type: "integer",
          minimum: 200,
          maximum: 10000,
          description: "Viewport height in pixels (default: 800)",
        },
        full_page: { type: "boolean", description: "Capture entire scrollable page (default: false)" },
        quality: { type: "integer", minimum: 1, maximum: 100, description: "Image quality (default: 90)" },
        delay: { type: "integer", minimum: 0, maximum: 10000, description: "Milliseconds to wait after load (default: 0)" },
        dark_mode: { type: "boolean", description: "Enable dark mode (default: false)" },
        block_ads: { type: "boolean", description: "Block ads (default: true)" },
        block_cookie_banners: { type: "boolean", description: "Remove cookie banners (default: true)" },
        device: {
          type: "string",
          enum: ["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"],
          description: "Device preset for emulation",
        },
        hide_selectors: { type: "string", description: "CSS selectors to hide" },
        click_selector: { type: "string", description: "CSS selector to click" },
        user_agent: { type: "string", description: "Custom user agent" },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_content",
    description:
      "Extract content from a web page. Returns structured data based on the extraction type. " +
      "Supports: markdown (readable content), text (plain text), html (raw HTML), " +
      "article (structured with title/author/excerpt), links (all page links), metadata (OG tags, title, description).",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to extract content from (must start with http:// or https://)",
        },
        type: {
          type: "string",
          enum: ["markdown", "text", "html", "article", "links", "metadata"],
          description: "Extraction type (default: markdown)",
        },
        selector: {
          type: "string",
          description: "CSS selector to scope extraction to a specific element",
        },
        block_ads: {
          type: "boolean",
          description: "Block advertisements and trackers (default: true)",
        },
        block_cookie_banners: {
          type: "boolean",
          description: "Remove cookie consent banners (default: true)",
        },
        delay: {
          type: "integer",
          minimum: 0,
          maximum: 10000,
          description: "Milliseconds to wait after page load (default: 0)",
        },
        max_length: {
          type: "integer",
          minimum: 1,
          maximum: 500000,
          description: "Maximum content length in characters (default: 100000)",
        },
        cache: {
          type: "boolean",
          description: "Use cached result if available (default: true)",
        },
        cache_ttl: {
          type: "integer",
          minimum: 0,
          maximum: 2592000,
          description: "Cache TTL in seconds (default: 86400)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "batch_screenshots",
    description:
      "Create a batch screenshot job for multiple URLs (1-50). " +
      "Returns immediately with a job ID. Use get_batch_status to poll for results. " +
      "All URLs share the same screenshot options. Each URL consumes one credit; failed URLs get credits rolled back.",
    inputSchema: {
      type: "object" as const,
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 50,
          description: "Array of URLs to capture (1-50)",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg", "webp", "pdf"],
          description: "Output format (default: png)",
        },
        width: {
          type: "integer",
          minimum: 320,
          maximum: 3840,
          description: "Viewport width in pixels (default: 1280)",
        },
        height: {
          type: "integer",
          minimum: 200,
          maximum: 10000,
          description: "Viewport height in pixels (default: 800)",
        },
        full_page: { type: "boolean", description: "Capture entire scrollable page (default: false)" },
        quality: { type: "integer", minimum: 1, maximum: 100, description: "Image quality (default: 90)" },
        delay: { type: "integer", minimum: 0, maximum: 10000, description: "Milliseconds to wait after load (default: 0)" },
        dark_mode: { type: "boolean", description: "Enable dark mode (default: false)" },
        block_ads: { type: "boolean", description: "Block ads (default: true)" },
        block_cookie_banners: { type: "boolean", description: "Remove cookie banners (default: true)" },
        device: {
          type: "string",
          enum: ["iphone_14", "iphone_15_pro", "pixel_7", "ipad_pro", "macbook_pro"],
          description: "Device preset for emulation",
        },
        hide_selectors: { type: "string", description: "CSS selectors to hide" },
        click_selector: { type: "string", description: "CSS selector to click" },
        user_agent: { type: "string", description: "Custom user agent" },
      },
      required: ["urls"],
    },
  },
  {
    name: "get_batch_status",
    description:
      "Get the status of a batch screenshot job. Poll this until status is 'completed' or 'failed'. " +
      "Completed items include presigned download URLs valid for 24 hours.",
    inputSchema: {
      type: "object" as const,
      properties: {
        job_id: {
          type: "string",
          description: "The batch job ID returned by batch_screenshots",
        },
      },
      required: ["job_id"],
    },
  },
  {
    name: "get_usage",
    description:
      "Get current month's screenshot usage statistics including " +
      "screenshots used, limit, and remaining quota.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// --- Helpers ---

async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body);
    return parsed.error?.message || body;
  } catch {
    return body;
  }
}

// --- Tool handlers ---

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "take_screenshot":
      return handleScreenshot(args as Record<string, unknown>);
    case "check_screenshot_cache":
      return handleCacheCheck(args as Record<string, unknown>);
    case "sign_screenshot_url":
      return handleSignUrl(args as Record<string, unknown>);
    case "extract_content":
      return handleExtract(args as Record<string, unknown>);
    case "batch_screenshots":
      return handleBatch(args as Record<string, unknown>);
    case "get_batch_status":
      return handleBatchStatus(args as Record<string, unknown>);
    case "get_usage":
      return handleUsage();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function handleScreenshot(args: Record<string, unknown>) {
  const url = args.url as string | undefined;
  const html = args.html as string | undefined;
  const markdown = args.markdown as string | undefined;

  if (!url && !html && !markdown) {
    throw new Error("One of url, html, or markdown is required");
  }

  const usePost = !!(html || markdown);
  let response: Response;

  if (usePost) {
    const body: Record<string, unknown> = {};
    if (url) body.url = url;
    if (html) body.html = html;
    if (markdown) body.markdown = markdown;

    const stringParams = ["format", "device", "hide_selectors", "click_selector", "user_agent"];
    const intParams = ["width", "height", "quality", "delay", "cache_ttl"];
    const boolParams = ["full_page", "dark_mode", "block_ads", "block_cookie_banners", "cache"];

    for (const key of stringParams) {
      if (args[key] !== undefined) body[key] = args[key];
    }
    for (const key of intParams) {
      if (args[key] !== undefined) body[key] = Number(args[key]);
    }
    for (const key of boolParams) {
      if (args[key] !== undefined) body[key] = !!args[key];
    }

    response = await fetch(`${BASE_URL}/v1/screenshot`, {
      method: "POST",
      headers: {
        "X-API-Key": API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } else {
    const params = new URLSearchParams();
    params.set("url", url!);

    const stringParams = ["format", "device", "hide_selectors", "click_selector", "user_agent"];
    const intParams = ["width", "height", "quality", "delay", "cache_ttl"];
    const boolParams = ["full_page", "dark_mode", "block_ads", "block_cookie_banners", "cache"];

    for (const key of stringParams) {
      if (args[key] !== undefined) params.set(key, String(args[key]));
    }
    for (const key of intParams) {
      if (args[key] !== undefined) params.set(key, String(args[key]));
    }
    for (const key of boolParams) {
      if (args[key] !== undefined) params.set(key, args[key] ? "true" : "false");
    }

    response = await fetch(`${BASE_URL}/v1/screenshot?${params}`, {
      headers: { "X-API-Key": API_KEY! },
    });
  }

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Screenshot failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const format = (args.format as string) || "png";

  const cacheStatus = response.headers.get("X-Cache") || "MISS";
  const responseTime = response.headers.get("X-Response-Time") || "unknown";
  const remaining = response.headers.get("X-Remaining-Credits") || "unknown";

  // PDFs are returned as text resource since MCP image type doesn't support PDF
  if (format === "pdf") {
    return {
      content: [
        {
          type: "text" as const,
          text: `PDF generated successfully (${buffer.byteLength} bytes, cache: ${cacheStatus}, time: ${responseTime}, remaining credits: ${remaining}). The PDF binary data is base64-encoded below:\n\n${base64}`,
        },
      ],
    };
  }

  const mimeType =
    format === "jpeg"
      ? "image/jpeg"
      : format === "webp"
        ? "image/webp"
        : "image/png";

  return {
    content: [
      {
        type: "image" as const,
        data: base64,
        mimeType,
      },
      {
        type: "text" as const,
        text: `Screenshot captured (${buffer.byteLength} bytes, cache: ${cacheStatus}, time: ${responseTime}, remaining credits: ${remaining})`,
      },
    ],
  };
}

async function handleSignUrl(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url) throw new Error("url is required");

  const body: Record<string, unknown> = { url };
  const stringParams = ["format", "device", "hide_selectors", "click_selector", "user_agent"];
  const intParams = ["expires_in", "width", "height", "quality", "delay"];
  const boolParams = ["full_page", "dark_mode", "block_ads", "block_cookie_banners"];

  for (const key of stringParams) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  for (const key of intParams) {
    if (args[key] !== undefined) body[key] = Number(args[key]);
  }
  for (const key of boolParams) {
    if (args[key] !== undefined) body[key] = !!args[key];
  }

  const response = await fetch(`${BASE_URL}/v1/screenshot/sign`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Sign URL failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json() as { signed_url: string; expires_at: string; expires_in: number };
  return {
    content: [
      {
        type: "text" as const,
        text: `Signed URL generated successfully.\n\nURL: ${data.signed_url}\nExpires: ${data.expires_at}\nValid for: ${data.expires_in} seconds\n\nAnyone with this URL can view the screenshot without an API key. The URL will stop working after expiry or if the API key is revoked.`,
      },
    ],
  };
}

async function handleExtract(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url) throw new Error("url is required");

  const body: Record<string, unknown> = { url };
  if (args.type !== undefined) body.type = args.type;
  if (args.selector !== undefined) body.selector = args.selector;
  if (args.block_ads !== undefined) body.block_ads = !!args.block_ads;
  if (args.block_cookie_banners !== undefined) body.block_cookie_banners = !!args.block_cookie_banners;
  if (args.delay !== undefined) body.delay = Number(args.delay);
  if (args.max_length !== undefined) body.max_length = Number(args.max_length);
  if (args.cache !== undefined) body.cache = !!args.cache;
  if (args.cache_ttl !== undefined) body.cache_ttl = Number(args.cache_ttl);

  const response = await fetch(`${BASE_URL}/v1/extract`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Extract failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json() as { url: string; type: string; content: unknown; wordCount?: number; processingTimeMs: number };
  const contentStr = typeof data.content === "string" ? data.content : JSON.stringify(data.content, null, 2);
  const meta = [`Type: ${data.type}`, `Time: ${data.processingTimeMs}ms`];
  if (data.wordCount) meta.push(`Words: ${data.wordCount}`);

  return {
    content: [
      {
        type: "text" as const,
        text: `${contentStr}\n\n---\n${meta.join(" | ")}`,
      },
    ],
  };
}

async function handleBatch(args: Record<string, unknown>) {
  const urls = args.urls as string[];
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new Error("urls array is required (1-50 URLs)");
  }

  const body: Record<string, unknown> = { urls };
  const stringParams = ["format", "device", "hide_selectors", "click_selector", "user_agent"];
  const intParams = ["width", "height", "quality", "delay"];
  const boolParams = ["full_page", "dark_mode", "block_ads", "block_cookie_banners"];

  for (const key of stringParams) {
    if (args[key] !== undefined) body[key] = args[key];
  }
  for (const key of intParams) {
    if (args[key] !== undefined) body[key] = Number(args[key]);
  }
  for (const key of boolParams) {
    if (args[key] !== undefined) body[key] = !!args[key];
  }

  const response = await fetch(`${BASE_URL}/v1/screenshot/batch`, {
    method: "POST",
    headers: {
      "X-API-Key": API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Batch creation failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json() as { jobId: string; status: string; statusUrl: string; total: number };
  return {
    content: [
      {
        type: "text" as const,
        text: `Batch job created successfully.\n\nJob ID: ${data.jobId}\nStatus: ${data.status}\nTotal URLs: ${data.total}\n\nUse get_batch_status with job_id="${data.jobId}" to poll for results.`,
      },
    ],
  };
}

async function handleBatchStatus(args: Record<string, unknown>) {
  const jobId = args.job_id as string;
  if (!jobId) throw new Error("job_id is required");

  const response = await fetch(`${BASE_URL}/v1/screenshot/batch/${jobId}`, {
    headers: { "X-API-Key": API_KEY! },
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Batch status check failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json() as {
    jobId: string; status: string; total: number; completed: number; failed: number;
    items: Array<{ url: string; status: string; downloadUrl?: string; error?: string }>;
    completedAt?: string;
  };

  const lines = [`Job: ${data.jobId}`, `Status: ${data.status}`, `Progress: ${data.completed + data.failed}/${data.total} (${data.completed} completed, ${data.failed} failed)`];
  if (data.completedAt) lines.push(`Completed at: ${data.completedAt}`);
  lines.push("", "Items:");
  for (const item of data.items) {
    if (item.status === "completed" && item.downloadUrl) {
      lines.push(`  [OK] ${item.url} -> ${item.downloadUrl}`);
    } else if (item.status === "failed") {
      lines.push(`  [FAIL] ${item.url}: ${item.error}`);
    } else {
      lines.push(`  [${item.status.toUpperCase()}] ${item.url}`);
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ],
  };
}

async function handleCacheCheck(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url) throw new Error("url is required");

  const params = new URLSearchParams({ url });
  // Pass all cache-key-relevant params so the lookup matches correctly
  const strKeys = ["format", "device", "hide_selectors", "click_selector"];
  const intKeys = ["width", "height", "quality"];
  const boolKeys = ["full_page", "dark_mode", "block_ads"];
  for (const k of strKeys) { if (args[k] !== undefined) params.set(k, String(args[k])); }
  for (const k of intKeys) { if (args[k] !== undefined) params.set(k, String(args[k])); }
  for (const k of boolKeys) { if (args[k] !== undefined) params.set(k, (args[k] as boolean) ? "true" : "false"); }

  const response = await fetch(
    `${BASE_URL}/v1/screenshot/info?${params}`,
    { headers: { "X-API-Key": API_KEY! } }
  );

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Cache check failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

async function handleUsage() {
  const response = await fetch(`${BASE_URL}/v1/usage`, {
    headers: { "X-API-Key": API_KEY! },
  });

  if (!response.ok) {
    const errorMessage = await parseErrorMessage(response);
    return {
      content: [
        {
          type: "text" as const,
          text: `Usage check failed (${response.status}): ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }

  const data = await response.json();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

// --- Start server ---

const transport = new StdioServerTransport();
await server.connect(transport);
