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
  { name: "snaprender-mcp", version: "1.0.4" },
  { capabilities: { tools: {} } }
);

// --- Tool definitions ---

const TOOLS = [
  {
    name: "take_screenshot",
    description:
      "Capture a screenshot of any website. Returns the image as a PNG, JPEG, WebP, or PDF. " +
      "Supports device emulation (iPhone, Pixel, iPad), dark mode, ad blocking, " +
      "cookie banner removal, full-page capture, and custom viewports.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to capture (must start with http:// or https://)",
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
      },
      required: ["url"],
    },
  },
  {
    name: "check_screenshot_cache",
    description:
      "Check if a screenshot is already cached without capturing a new one. " +
      "Does not count against your quota.",
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
      },
      required: ["url"],
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
    case "get_usage":
      return handleUsage();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function handleScreenshot(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url) throw new Error("url is required");

  const params = new URLSearchParams();
  params.set("url", url);

  // Map all optional params
  const stringParams = ["format", "device", "hide_selectors", "click_selector"];
  const intParams = ["width", "height", "quality", "delay"];
  const boolParams = ["full_page", "dark_mode", "block_ads", "block_cookie_banners"];

  for (const key of stringParams) {
    if (args[key] !== undefined) params.set(key, String(args[key]));
  }
  for (const key of intParams) {
    if (args[key] !== undefined) params.set(key, String(args[key]));
  }
  for (const key of boolParams) {
    if (args[key] !== undefined) params.set(key, args[key] ? "true" : "false");
  }

  const response = await fetch(`${BASE_URL}/v1/screenshot?${params}`, {
    headers: { "X-API-Key": API_KEY! },
  });

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

async function handleCacheCheck(args: Record<string, unknown>) {
  const url = args.url as string;
  if (!url) throw new Error("url is required");

  const params = new URLSearchParams({ url });
  if (args.format) params.set("format", args.format as string);

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
